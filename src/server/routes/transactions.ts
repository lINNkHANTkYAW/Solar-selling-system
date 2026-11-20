import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  accountTransactions,
  businessSettings,
  customers,
  financialAccounts,
  products,
  purchaseItems,
  purchasePayments,
  purchaseReturns,
  purchases,
  saleItems,
  salePayments,
  saleReturns,
  sales,
  stockMovements,
  suppliers,
  warrantyRecords,
} from '../../db/schema.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import {
  addMonthsToDate,
  assertDayNotClosed,
  generateRefNumber,
  getYangonToday,
  num,
  toMoney,
  writeAuditLog,
} from '../helpers.ts';

export const transactionsRouter = Router();

// ==================== PURCHASES ====================

transactionsRouter.get('/purchases', async (_req, res) => {
  try {
    const [purRows, supRows, itemRows] = await Promise.all([
      db.select().from(purchases).orderBy(desc(purchases.createdAt)),
      db.select().from(suppliers),
      db.select().from(purchaseItems),
    ]);
    const supMap = new Map(supRows.map((s) => [s.id, s]));
    const itemsByPurchase = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByPurchase.get(item.purchaseId) || [];
      list.push(item);
      itemsByPurchase.set(item.purchaseId, list);
    }

    res.json(
      purRows.map((p) => ({
        ...p,
        supplierName: supMap.get(p.supplierId)?.name || 'Unknown Supplier',
        items: itemsByPurchase.get(p.id) || [],
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch purchases.' });
  }
});

transactionsRouter.get('/purchases/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [pur] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
    if (!pur) return res.status(404).json({ error: 'Purchase not found.' });
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, pur.supplierId)).limit(1);
    const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    const payments = await db
      .select()
      .from(purchasePayments)
      .where(eq(purchasePayments.purchaseId, id))
      .orderBy(desc(purchasePayments.createdAt));
    const returns = await db
      .select()
      .from(purchaseReturns)
      .where(eq(purchaseReturns.purchaseId, id))
      .orderBy(desc(purchaseReturns.createdAt));

    res.json({ ...pur, supplier: sup, items, payments, returns });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load purchase details.' });
  }
});

// Create Purchase (Draft does NOT affect stock/balance; Received updates stock + Weighted Average Cost + Supplier Payable + Payment)
transactionsRouter.post('/purchases', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.supplierId || items.length === 0) {
      return res.status(400).json({ error: 'Supplier and at least one product item are required.' });
    }

    const purchaseDate = String(b.purchaseDate || getYangonToday());
    const isDraft = b.status === 'draft';
    const discountAmount = Math.max(0, num(b.discountAmount));
    const additionalCharges = Math.max(0, num(b.additionalCharges));
    const paidAmount = isDraft ? 0 : Math.max(0, num(b.paidAmount));
    const paymentMethod = String(b.paymentMethod || 'Cash');

    const created = await db.transaction(async (tx) => {
      if (!isDraft) {
        await assertDayNotClosed(tx, purchaseDate, req.appUser?.role || 'staff');
      }

      const [settings] = await tx.select().from(businessSettings).limit(1);
      const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, b.supplierId)).limit(1);
      if (!sup) throw new Error('Selected supplier not found.');

      let subtotal = 0;
      const resolvedItems: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitCost: number;
        lineTotal: number;
      }> = [];

      for (const raw of items) {
        const qty = num(raw.quantity);
        const unitCost = num(raw.unitCost);
        if (qty <= 0 || unitCost < 0) {
          throw new Error('Invalid item quantity or unit cost.');
        }
        const [prod] = await tx.select().from(products).where(eq(products.id, raw.productId)).limit(1);
        if (!prod) throw new Error('One of the selected products does not exist.');
        const lineTotal = qty * unitCost;
        subtotal += lineTotal;
        resolvedItems.push({
          productId: prod.id,
          productName: prod.name,
          quantity: qty,
          unitCost,
          lineTotal,
        });
      }

      const totalAmount = Math.max(0, subtotal - discountAmount + additionalCharges);
      if (paidAmount > totalAmount) {
        throw new Error('Paid amount cannot exceed purchase total amount.');
      }
      const outstandingAmount = totalAmount - paidAmount;

      const finalStatus = isDraft
        ? 'draft'
        : outstandingAmount <= 0
          ? 'fully_paid'
          : paidAmount > 0
            ? 'partially_paid'
            : 'received';

      const purchaseNumber =
        String(b.purchaseNumber || '').trim() ||
        generateRefNumber(settings?.purchasePrefix || 'PUR');

      const [pur] = await tx
        .insert(purchases)
        .values({
          purchaseNumber,
          supplierId: sup.id,
          purchaseDate,
          subtotal: toMoney(subtotal),
          discountAmount: toMoney(discountAmount),
          additionalCharges: toMoney(additionalCharges),
          totalAmount: toMoney(totalAmount),
          paidAmount: toMoney(paidAmount),
          outstandingAmount: toMoney(outstandingAmount),
          status: finalStatus,
          paymentMethod,
          notes: String(b.notes || ''),
          attachmentUrl: String(b.attachmentUrl || ''),
          userId: req.appUser?.id,
        })
        .returning();

      for (const item of resolvedItems) {
        await tx.insert(purchaseItems).values({
          purchaseId: pur.id,
          productId: item.productId,
          productName: item.productName,
          quantity: toMoney(item.quantity),
          unitCost: toMoney(item.unitCost),
          lineTotal: toMoney(item.lineTotal),
        });

        // Only update stock & weighted average cost when confirmed/received!
        if (!isDraft) {
          const [prod] = await tx
            .select()
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1);
          const oldQty = Math.max(0, num(prod.currentStock));
          const oldWac = num(prod.weightedAvgCost);
          const newQty = num(prod.currentStock) + item.quantity;
          const totalUnits = oldQty + item.quantity;
          const newWac =
            totalUnits > 0 ? (oldQty * oldWac + item.quantity * item.unitCost) / totalUnits : item.unitCost;

          await tx
            .update(products)
            .set({
              currentStock: toMoney(newQty),
              purchasePrice: toMoney(item.unitCost),
              weightedAvgCost: toMoney(newWac),
              updatedAt: new Date(),
            })
            .where(eq(products.id, item.productId));

          await tx.insert(stockMovements).values({
            productId: item.productId,
            quantity: toMoney(item.quantity),
            movementType: 'purchase_in',
            referenceType: 'purchase',
            referenceId: pur.id,
            referenceNumber: pur.purchaseNumber,
            previousQty: prod.currentStock,
            newQty: toMoney(newQty),
            unitCost: toMoney(item.unitCost),
            reason: `Purchase received from ${sup.name}`,
            userId: req.appUser?.id,
          });
        }
      }

      if (!isDraft) {
        // Increase supplier payable by outstanding balance
        if (outstandingAmount > 0) {
          await tx
            .update(suppliers)
            .set({
              payableBalance: toMoney(num(sup.payableBalance) + outstandingAmount),
              updatedAt: new Date(),
            })
            .where(eq(suppliers.id, sup.id));
        }

        // Record actual payment cash/bank outflow (NOT a double expense!)
        if (paidAmount > 0) {
          const accId = b.accountId;
          const [acc] = accId
            ? await tx.select().from(financialAccounts).where(eq(financialAccounts.id, accId)).limit(1)
            : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
          if (!acc) throw new Error('Payment account is required when recording a payment.');

          const nextBal = num(acc.currentBalance) - paidAmount;
          await tx
            .update(financialAccounts)
            .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
            .where(eq(financialAccounts.id, acc.id));

          await tx.insert(purchasePayments).values({
            purchaseId: pur.id,
            supplierId: sup.id,
            accountId: acc.id,
            paymentDate: purchaseDate,
            amount: toMoney(paidAmount),
            paymentMethod,
            referenceNote: `Initial payment for ${pur.purchaseNumber}`,
            idempotencyKey: b.idempotencyKey || `${pur.id}-init`,
            userId: req.appUser?.id,
          });

          await tx.insert(accountTransactions).values({
            accountId: acc.id,
            transactionDate: purchaseDate,
            direction: 'out',
            amount: toMoney(paidAmount),
            balanceAfter: toMoney(nextBal),
            category: 'Inventory Purchase Payment',
            referenceType: 'purchase_payment',
            referenceId: pur.id,
            referenceNumber: pur.purchaseNumber,
            description: `Purchase ${pur.purchaseNumber} — ${sup.name}`,
            userId: req.appUser?.id,
          });
        }
      }

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: isDraft ? 'CREATE_PURCHASE_DRAFT' : 'CREATE_PURCHASE_RECEIVED',
        module: 'purchases',
        recordId: pur.id,
        newValue: { purchaseNumber: pur.purchaseNumber, totalAmount, paidAmount, status: finalStatus },
        reason: isDraft ? 'Saved draft purchase' : 'Confirmed purchase and received stock',
      });

      return pur;
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create purchase failed:', error);
    res.status(400).json({ error: error.message || 'Failed to record purchase.' });
  }
});

// Receive a Draft Purchase
transactionsRouter.post('/purchases/:id/receive', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const paidAmount = Math.max(0, num(req.body.paidAmount));
    const paymentMethod = String(req.body.paymentMethod || 'Cash');
    const accountId = req.body.accountId;

    const updated = await db.transaction(async (tx) => {
      const [pur] = await tx.select().from(purchases).where(eq(purchases.id, id)).limit(1);
      if (!pur) throw new Error('Purchase not found.');
      if (pur.status !== 'draft') throw new Error('Only draft purchases can be received.');

      await assertDayNotClosed(tx, pur.purchaseDate, req.appUser?.role || 'staff');
      const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, pur.supplierId)).limit(1);
      const items = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));

      for (const item of items) {
        const [prod] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        const qty = num(item.quantity);
        const unitCost = num(item.unitCost);
        const oldQty = Math.max(0, num(prod.currentStock));
        const oldWac = num(prod.weightedAvgCost);
        const newQty = num(prod.currentStock) + qty;
        const newWac =
          oldQty + qty > 0 ? (oldQty * oldWac + qty * unitCost) / (oldQty + qty) : unitCost;

        await tx
          .update(products)
          .set({
            currentStock: toMoney(newQty),
            purchasePrice: toMoney(unitCost),
            weightedAvgCost: toMoney(newWac),
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));

        await tx.insert(stockMovements).values({
          productId: item.productId,
          quantity: toMoney(qty),
          movementType: 'purchase_in',
          referenceType: 'purchase',
          referenceId: pur.id,
          referenceNumber: pur.purchaseNumber,
          previousQty: prod.currentStock,
          newQty: toMoney(newQty),
          unitCost: toMoney(unitCost),
          reason: `Draft purchase confirmed & received`,
          userId: req.appUser?.id,
        });
      }

      const totalAmount = num(pur.totalAmount);
      if (paidAmount > totalAmount) throw new Error('Paid amount exceeds purchase total.');
      const outstanding = totalAmount - paidAmount;
      const nextStatus =
        outstanding <= 0 ? 'fully_paid' : paidAmount > 0 ? 'partially_paid' : 'received';

      const [updatedPur] = await tx
        .update(purchases)
        .set({
          paidAmount: toMoney(paidAmount),
          outstandingAmount: toMoney(outstanding),
          status: nextStatus,
          paymentMethod,
          updatedAt: new Date(),
        })
        .where(eq(purchases.id, id))
        .returning();

      if (sup && outstanding > 0) {
        await tx
          .update(suppliers)
          .set({ payableBalance: toMoney(num(sup.payableBalance) + outstanding) })
          .where(eq(suppliers.id, sup.id));
      }

      if (paidAmount > 0) {
        const [acc] = accountId
          ? await tx.select().from(financialAccounts).where(eq(financialAccounts.id, accountId)).limit(1)
          : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
        if (!acc) throw new Error('Financial account not found.');
        const nextBal = num(acc.currentBalance) - paidAmount;
        await tx
          .update(financialAccounts)
          .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
          .where(eq(financialAccounts.id, acc.id));

        await tx.insert(purchasePayments).values({
          purchaseId: pur.id,
          supplierId: pur.supplierId,
          accountId: acc.id,
          paymentDate: getYangonToday(),
          amount: toMoney(paidAmount),
          paymentMethod,
          referenceNote: `Payment upon receiving ${pur.purchaseNumber}`,
          idempotencyKey: req.body.idempotencyKey || `${pur.id}-recv`,
          userId: req.appUser?.id,
        });

        await tx.insert(accountTransactions).values({
          accountId: acc.id,
          transactionDate: getYangonToday(),
          direction: 'out',
          amount: toMoney(paidAmount),
          balanceAfter: toMoney(nextBal),
          category: 'Inventory Purchase Payment',
          referenceType: 'purchase_payment',
          referenceId: pur.id,
          referenceNumber: pur.purchaseNumber,
          description: `Received ${pur.purchaseNumber}`,
          userId: req.appUser?.id,
        });
      }

      return updatedPur;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to receive draft purchase.' });
  }
});

// Pay Supplier Payable (Decreases Cash/Bank & Payables — NEVER creates duplicate purchase expense!)
transactionsRouter.post('/purchases/:id/pay', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const amount = num(req.body.amount);
    const accountId = req.body.accountId;
    const paymentMethod = String(req.body.paymentMethod || 'Cash');
    const paymentDate = String(req.body.paymentDate || getYangonToday());
    const idempotencyKey = req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined;

    if (amount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than zero.' });

    const result = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, paymentDate, req.appUser?.role || 'staff');
      if (idempotencyKey) {
        const dup = await tx
          .select()
          .from(purchasePayments)
          .where(eq(purchasePayments.idempotencyKey, idempotencyKey))
          .limit(1);
        if (dup.length > 0) throw new Error('Duplicate payment submission prevented.');
      }

      const [pur] = await tx.select().from(purchases).where(eq(purchases.id, id)).limit(1);
      if (!pur) throw new Error('Purchase not found.');
      if (pur.status === 'draft' || pur.status === 'cancelled') {
        throw new Error('Cannot pay a draft or cancelled purchase.');
      }
      const outstanding = num(pur.outstandingAmount);
      if (amount > outstanding + 0.01) {
        throw new Error(`Payment exceeds outstanding payable (${outstanding} MMK).`);
      }

      const [acc] = accountId
        ? await tx.select().from(financialAccounts).where(eq(financialAccounts.id, accountId)).limit(1)
        : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
      if (!acc) throw new Error('Payment account required.');

      const nextPaid = num(pur.paidAmount) + amount;
      const nextOut = Math.max(0, num(pur.totalAmount) - nextPaid);
      const nextStatus = nextOut <= 0.01 ? 'fully_paid' : 'partially_paid';

      const [updatedPur] = await tx
        .update(purchases)
        .set({
          paidAmount: toMoney(nextPaid),
          outstandingAmount: toMoney(nextOut),
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(purchases.id, id))
        .returning();

      const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, pur.supplierId)).limit(1);
      if (sup) {
        await tx
          .update(suppliers)
          .set({
            payableBalance: toMoney(Math.max(0, num(sup.payableBalance) - amount)),
            updatedAt: new Date(),
          })
          .where(eq(suppliers.id, sup.id));
      }

      const nextBal = num(acc.currentBalance) - amount;
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, acc.id));

      await tx.insert(purchasePayments).values({
        purchaseId: pur.id,
        supplierId: pur.supplierId,
        accountId: acc.id,
        paymentDate,
        amount: toMoney(amount),
        paymentMethod,
        referenceNote: String(req.body.referenceNote || 'Supplier payable settlement'),
        idempotencyKey: idempotencyKey || `${pur.id}-${Date.now()}`,
        userId: req.appUser?.id,
      });

      await tx.insert(accountTransactions).values({
        accountId: acc.id,
        transactionDate: paymentDate,
        direction: 'out',
        amount: toMoney(amount),
        balanceAfter: toMoney(nextBal),
        category: 'Supplier Payable Payment',
        referenceType: 'supplier_payment',
        referenceId: pur.id,
        referenceNumber: pur.purchaseNumber,
        description: `Payable settlement for ${pur.purchaseNumber} — ${sup?.name || ''}`,
        userId: req.appUser?.id,
      });

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'SUPPLIER_PAYMENT',
        module: 'purchases',
        recordId: pur.id,
        newValue: { amount, paymentMethod, remainingPayable: nextOut },
        reason: 'Supplier payable payment recorded',
      });

      return updatedPur;
    });

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Supplier payment failed.' });
  }
});

// Purchase Return (Validates return qty <= purchased - alreadyReturned; reduces stock & adjusts payable/refund)
transactionsRouter.post('/purchases/:id/return', async (req: AuthRequest, res) => {
  try {
    const purchaseId = req.params.id;
    const { purchaseItemId, quantity, settlementType, refundAccountId, reason } = req.body;
    const qty = num(quantity);
    if (!purchaseItemId || qty <= 0 || !reason) {
      return res.status(400).json({ error: 'Item, positive return quantity, and reason are required.' });
    }

    const ret = await db.transaction(async (tx) => {
      const today = getYangonToday();
      await assertDayNotClosed(tx, today, req.appUser?.role || 'staff');

      const [pur] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
      if (!pur || pur.status === 'draft' || pur.status === 'cancelled') {
        throw new Error('Cannot return items on a draft or cancelled purchase.');
      }

      const [item] = await tx
        .select()
        .from(purchaseItems)
        .where(eq(purchaseItems.id, purchaseItemId))
        .limit(1);
      if (!item || item.purchaseId !== purchaseId) throw new Error('Purchase item not found.');

      const returnable = num(item.quantity) - num(item.returnedQuantity);
      if (qty > returnable) {
        throw new Error(`Cannot return ${qty}. Maximum returnable quantity is ${returnable}.`);
      }

      const [prod] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
      const nextStock = num(prod.currentStock) - qty;
      if (nextStock < 0) {
        throw new Error(`Insufficient stock on hand (${prod.currentStock}) to return ${qty} units to supplier.`);
      }

      const adjustmentAmount = qty * num(item.unitCost);
      const returnNumber = generateRefNumber('PRET');

      await tx
        .update(purchaseItems)
        .set({ returnedQuantity: toMoney(num(item.returnedQuantity) + qty) })
        .where(eq(purchaseItems.id, item.id));

      await tx
        .update(products)
        .set({ currentStock: toMoney(nextStock), updatedAt: new Date() })
        .where(eq(products.id, prod.id));

      await tx.insert(stockMovements).values({
        productId: prod.id,
        quantity: toMoney(-qty),
        movementType: 'purchase_return_out',
        referenceType: 'purchase_return',
        referenceId: pur.id,
        referenceNumber: returnNumber,
        previousQty: prod.currentStock,
        newQty: toMoney(nextStock),
        unitCost: item.unitCost,
        reason: String(reason),
        userId: req.appUser?.id,
      });

      const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, pur.supplierId)).limit(1);

      if (settlementType === 'cash_refund' && refundAccountId) {
        const [acc] = await tx
          .select()
          .from(financialAccounts)
          .where(eq(financialAccounts.id, refundAccountId))
          .limit(1);
        if (!acc) throw new Error('Refund account not found.');
        const nextBal = num(acc.currentBalance) + adjustmentAmount;
        await tx
          .update(financialAccounts)
          .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
          .where(eq(financialAccounts.id, acc.id));

        await tx.insert(accountTransactions).values({
          accountId: acc.id,
          transactionDate: today,
          direction: 'in',
          amount: toMoney(adjustmentAmount),
          balanceAfter: toMoney(nextBal),
          category: 'Purchase Return Refund',
          referenceType: 'purchase_refund',
          referenceId: pur.id,
          referenceNumber: returnNumber,
          description: `Supplier refund for ${pur.purchaseNumber}`,
          userId: req.appUser?.id,
        });
      } else {
        const nextOutstanding = Math.max(0, num(pur.outstandingAmount) - adjustmentAmount);
        await tx
          .update(purchases)
          .set({
            outstandingAmount: toMoney(nextOutstanding),
            status: nextOutstanding <= 0.01 ? 'fully_paid' : pur.status,
            updatedAt: new Date(),
          })
          .where(eq(purchases.id, pur.id));

        if (sup) {
          await tx
            .update(suppliers)
            .set({
              payableBalance: toMoney(Math.max(0, num(sup.payableBalance) - adjustmentAmount)),
              updatedAt: new Date(),
            })
            .where(eq(suppliers.id, sup.id));
        }
      }

      const [createdRet] = await tx
        .insert(purchaseReturns)
        .values({
          returnNumber,
          purchaseId,
          purchaseItemId,
          productId: prod.id,
          quantity: toMoney(qty),
          adjustmentAmount: toMoney(adjustmentAmount),
          refundAccountId: refundAccountId || null,
          settlementType: settlementType || 'payable_adjustment',
          reason: String(reason),
          returnDate: today,
          userId: req.appUser?.id,
        })
        .returning();

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'PURCHASE_RETURN',
        module: 'purchases',
        recordId: pur.id,
        newValue: { returnNumber, qty, adjustmentAmount, settlementType },
        reason: String(reason),
      });

      return createdRet;
    });

    res.status(201).json(ret);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Purchase return failed.' });
  }
});

// ==================== SALES & POS ====================

transactionsRouter.get('/sales', async (_req, res) => {
  try {
    const [saleRows, itemRows] = await Promise.all([
      db.select().from(sales).orderBy(desc(sales.createdAt)),
      db.select().from(saleItems),
    ]);
    const itemsBySale = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsBySale.get(item.saleId) || [];
      list.push(item);
      itemsBySale.set(item.saleId, list);
    }

    res.json(
      saleRows.map((s) => ({
        ...s,
        items: itemsBySale.get(s.id) || [],
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sales history.' });
  }
});

transactionsRouter.get('/sales/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
    if (!sale) return res.status(404).json({ error: 'Sale invoice not found.' });
    const [items, payments, returns] = await Promise.all([
      db.select().from(saleItems).where(eq(saleItems.saleId, id)),
      db
        .select()
        .from(salePayments)
        .where(eq(salePayments.saleId, id))
        .orderBy(desc(salePayments.createdAt)),
      db
        .select()
        .from(saleReturns)
        .where(eq(saleReturns.saleId, id))
        .orderBy(desc(saleReturns.createdAt)),
    ]);
    res.json({ ...sale, items, payments, returns });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sale invoice details.' });
  }
});

// Atomic POS Sale Creation (Validates stock, snapshots COGS, deducts inventory, records payments/receivables, creates warranties)
transactionsRouter.post('/sales', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty. Add at least one product.' });
    }

    const saleDate = String(b.saleDate || getYangonToday());
    const overallDiscount = Math.max(0, num(b.overallDiscount));
    const additionalCharges = Math.max(0, num(b.additionalCharges));
    const paymentMethod = String(b.paymentMethod || 'Cash');
    const isCredit = paymentMethod === 'Credit';
    const paidAmount = isCredit ? 0 : Math.max(0, num(b.paidAmount));

    const created = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, saleDate, req.appUser?.role || 'staff');

      const [settings] = await tx.select().from(businessSettings).limit(1);
      let customerRecord: typeof customers.$inferSelect | null = null;
      if (b.customerId) {
        const [c] = await tx.select().from(customers).where(eq(customers.id, b.customerId)).limit(1);
        customerRecord = c || null;
      }

      const customerName = customerRecord?.name || String(b.customerName || 'Walk-in Customer');

      let subtotal = 0;
      let itemDiscountTotal = 0;
      let totalCogs = 0;

      const resolvedItems: Array<{
        prod: typeof products.$inferSelect;
        quantity: number;
        unitPrice: number;
        discountAmount: number;
        lineTotal: number;
        unitCostSnapshot: number;
        serialNumbers: string;
      }> = [];

      for (const raw of items) {
        const qty = num(raw.quantity);
        if (qty <= 0) throw new Error('Item quantity must be greater than zero.');

        const [prod] = await tx.select().from(products).where(eq(products.id, raw.productId)).limit(1);
        if (!prod) throw new Error('One of the products in the cart no longer exists.');

        const avail = num(prod.currentStock);
        if (avail - qty < 0 && !settings?.allowNegativeStock) {
          throw new Error(
            `Insufficient stock for "${prod.name}" (Available: ${avail} ${prod.unit}, Requested: ${qty}).`
          );
        }

        const unitPrice = num(raw.unitPrice ?? prod.sellingPrice);
        const itemDiscount = Math.max(0, num(raw.discountAmount));
        const grossLine = qty * unitPrice;
        const lineTotal = Math.max(0, grossLine - itemDiscount);
        const unitCostSnapshot = num(prod.weightedAvgCost);

        subtotal += grossLine;
        itemDiscountTotal += itemDiscount;
        totalCogs += qty * unitCostSnapshot;

        resolvedItems.push({
          prod,
          quantity: qty,
          unitPrice,
          discountAmount: itemDiscount,
          lineTotal,
          unitCostSnapshot,
          serialNumbers: String(raw.serialNumbers || '').trim(),
        });
      }

      const netBeforeTax = Math.max(0, subtotal - itemDiscountTotal - overallDiscount + additionalCharges);
      const taxAmount = settings?.taxEnabled ? (netBeforeTax * num(settings.taxRate)) / 100 : 0;
      const grandTotal = netBeforeTax + taxAmount;

      const actualPaid = Math.min(paidAmount, grandTotal);
      const outstandingAmount = Math.max(0, grandTotal - actualPaid);

      if (outstandingAmount > 0 && !customerRecord) {
        throw new Error('Please select or register a customer to record a credit or partial-payment sale.');
      }

      const grossProfit = grandTotal - taxAmount - totalCogs;
      const status =
        outstandingAmount <= 0.01
          ? 'fully_paid'
          : actualPaid > 0
            ? 'partially_paid'
            : 'completed';

      const invoiceNumber = generateRefNumber(settings?.invoicePrefix || 'INV');

      const [sale] = await tx
        .insert(sales)
        .values({
          invoiceNumber,
          customerId: customerRecord?.id || null,
          customerName,
          saleDate,
          subtotal: toMoney(subtotal),
          itemDiscountTotal: toMoney(itemDiscountTotal),
          overallDiscount: toMoney(overallDiscount),
          additionalCharges: toMoney(additionalCharges),
          taxAmount: toMoney(taxAmount),
          grandTotal: toMoney(grandTotal),
          paidAmount: toMoney(actualPaid),
          outstandingAmount: toMoney(outstandingAmount),
          totalCogs: toMoney(totalCogs),
          grossProfit: toMoney(grossProfit),
          status,
          paymentMethod,
          notes: String(b.notes || ''),
          salespersonId: req.appUser?.id,
          quotationId: b.quotationId || null,
        })
        .returning();

      for (const item of resolvedItems) {
        await tx.insert(saleItems).values({
          saleId: sale.id,
          productId: item.prod.id,
          productName: item.prod.name,
          burmeseName: item.prod.burmeseName,
          quantity: toMoney(item.quantity),
          unitPrice: toMoney(item.unitPrice),
          unitCostSnapshot: toMoney(item.unitCostSnapshot),
          discountAmount: toMoney(item.discountAmount),
          lineTotal: toMoney(item.lineTotal),
          warrantyMonths: item.prod.warrantyMonths,
          serialNumbers: item.serialNumbers,
        });

        // Deduct Inventory + Insert Immutable Stock Movement
        const newStock = num(item.prod.currentStock) - item.quantity;
        await tx
          .update(products)
          .set({ currentStock: toMoney(newStock), updatedAt: new Date() })
          .where(eq(products.id, item.prod.id));

        await tx.insert(stockMovements).values({
          productId: item.prod.id,
          quantity: toMoney(-item.quantity),
          movementType: 'sale_out',
          referenceType: 'sale',
          referenceId: sale.id,
          referenceNumber: sale.invoiceNumber,
          previousQty: item.prod.currentStock,
          newQty: toMoney(newStock),
          unitCost: toMoney(item.unitCostSnapshot),
          reason: `POS Sale ${sale.invoiceNumber} to ${customerName}`,
          userId: req.appUser?.id,
        });

        // Auto-create warranty records if serial numbers entered or product tracks warranty & serials
        if (item.prod.warrantyMonths > 0 && item.serialNumbers) {
          const serialList = item.serialNumbers
            .split(/[,\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          for (const sn of serialList) {
            await tx.insert(warrantyRecords).values({
              serialNumber: sn,
              productId: item.prod.id,
              productName: item.prod.name,
              customerId: customerRecord?.id || null,
              customerName,
              customerPhone: customerRecord?.phone || '',
              saleId: sale.id,
              invoiceNumber: sale.invoiceNumber,
              saleDate,
              warrantyStartDate: saleDate,
              warrantyEndDate: addMonthsToDate(saleDate, item.prod.warrantyMonths),
              warrantyMonths: item.prod.warrantyMonths,
              status: 'active',
            });
          }
        }
      }

      // Update Customer Receivables ONLY for unpaid portion
      if (customerRecord && outstandingAmount > 0) {
        await tx
          .update(customers)
          .set({
            receivableBalance: toMoney(num(customerRecord.receivableBalance) + outstandingAmount),
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerRecord.id));
      }

      // Record Financial Account Cash/Digital Receipt ONLY for actualPaid > 0
      if (actualPaid > 0) {
        let acc = null;
        if (b.accountId) {
          const [found] = await tx
            .select()
            .from(financialAccounts)
            .where(eq(financialAccounts.id, b.accountId))
            .limit(1);
          acc = found;
        }
        if (!acc) {
          const accs = await tx.select().from(financialAccounts);
          const targetType =
            paymentMethod === 'KBZPay'
              ? 'kbzpay'
              : paymentMethod === 'WavePay'
                ? 'wavepay'
                : paymentMethod === 'Bank Transfer'
                  ? 'bank'
                  : 'cash';
          acc = accs.find((a) => a.accountType === targetType) || accs.find((a) => a.isDefault) || accs[0];
        }
        if (!acc) throw new Error('No financial account available to receive payment.');

        const nextBal = num(acc.currentBalance) + actualPaid;
        await tx
          .update(financialAccounts)
          .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
          .where(eq(financialAccounts.id, acc.id));

        await tx.insert(salePayments).values({
          saleId: sale.id,
          customerId: customerRecord?.id || null,
          accountId: acc.id,
          paymentDate: saleDate,
          amount: toMoney(actualPaid),
          paymentMethod,
          isDebtCollection: false,
          referenceNote: `POS Checkout ${sale.invoiceNumber}`,
          idempotencyKey: b.idempotencyKey || `${sale.id}-pos`,
          userId: req.appUser?.id,
        });

        await tx.insert(accountTransactions).values({
          accountId: acc.id,
          transactionDate: saleDate,
          direction: 'in',
          amount: toMoney(actualPaid),
          balanceAfter: toMoney(nextBal),
          category: 'Product Sales',
          referenceType: 'sale_payment',
          referenceId: sale.id,
          referenceNumber: sale.invoiceNumber,
          description: `POS Sale ${sale.invoiceNumber} — ${customerName}`,
          userId: req.appUser?.id,
        });
      }

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CREATE_SALE',
        module: 'sales',
        recordId: sale.id,
        newValue: {
          invoiceNumber: sale.invoiceNumber,
          grandTotal,
          paidAmount: actualPaid,
          outstandingAmount,
          grossProfit,
        },
        reason: 'Confirmed POS sale',
      });

      return { ...sale, items: resolvedItems.map((r) => ({ ...r, productName: r.prod.name, burmeseName: r.prod.burmeseName, warrantyMonths: r.prod.warrantyMonths })) };
    });

    res.status(201).json(created);
  } catch (error: any) {
    console.error('POS Sale failed:', error);
    res.status(400).json({ error: error.message || 'Sale transaction failed and was rolled back.' });
  }
});

// Customer Debt Collection (Increases Cash/Bank & Reduces Receivable — NEVER creates new sales revenue!)
transactionsRouter.post('/sales/:id/collect', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const amount = num(req.body.amount);
    const accountId = req.body.accountId;
    const paymentMethod = String(req.body.paymentMethod || 'Cash');
    const paymentDate = String(req.body.paymentDate || getYangonToday());
    const idempotencyKey = req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined;

    if (amount <= 0) return res.status(400).json({ error: 'Collection amount must be greater than zero.' });

    const updated = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, paymentDate, req.appUser?.role || 'staff');
      if (idempotencyKey) {
        const dup = await tx
          .select()
          .from(salePayments)
          .where(eq(salePayments.idempotencyKey, idempotencyKey))
          .limit(1);
        if (dup.length > 0) throw new Error('Duplicate debt collection prevented.');
      }

      const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).limit(1);
      if (!sale) throw new Error('Sale invoice not found.');
      if (sale.status === 'cancelled') throw new Error('Cannot collect payment on a cancelled invoice.');

      const outstanding = num(sale.outstandingAmount);
      if (amount > outstanding + 0.01) {
        throw new Error(`Amount exceeds remaining balance (${outstanding} MMK).`);
      }

      const [acc] = accountId
        ? await tx.select().from(financialAccounts).where(eq(financialAccounts.id, accountId)).limit(1)
        : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
      if (!acc) throw new Error('Financial account is required.');

      const nextPaid = num(sale.paidAmount) + amount;
      const nextOut = Math.max(0, num(sale.grandTotal) - nextPaid);
      const nextStatus = nextOut <= 0.01 ? 'fully_paid' : 'partially_paid';

      const [updatedSale] = await tx
        .update(sales)
        .set({
          paidAmount: toMoney(nextPaid),
          outstandingAmount: toMoney(nextOut),
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(sales.id, id))
        .returning();

      if (sale.customerId) {
        const [cust] = await tx
          .select()
          .from(customers)
          .where(eq(customers.id, sale.customerId))
          .limit(1);
        if (cust) {
          await tx
            .update(customers)
            .set({
              receivableBalance: toMoney(Math.max(0, num(cust.receivableBalance) - amount)),
              updatedAt: new Date(),
            })
            .where(eq(customers.id, cust.id));
        }
      }

      const nextBal = num(acc.currentBalance) + amount;
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, acc.id));

      await tx.insert(salePayments).values({
        saleId: sale.id,
        customerId: sale.customerId,
        accountId: acc.id,
        paymentDate,
        amount: toMoney(amount),
        paymentMethod,
        isDebtCollection: true,
        referenceNote: String(req.body.referenceNote || `Debt collection for ${sale.invoiceNumber}`),
        idempotencyKey: idempotencyKey || `${sale.id}-col-${Date.now()}`,
        userId: req.appUser?.id,
      });

      await tx.insert(accountTransactions).values({
        accountId: acc.id,
        transactionDate: paymentDate,
        direction: 'in',
        amount: toMoney(amount),
        balanceAfter: toMoney(nextBal),
        category: 'Customer Debt Collection',
        referenceType: 'debt_collection',
        referenceId: sale.id,
        referenceNumber: sale.invoiceNumber,
        description: `Receivable collection ${sale.invoiceNumber} — ${sale.customerName}`,
        userId: req.appUser?.id,
      });

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'COLLECT_CUSTOMER_DEBT',
        module: 'sales',
        recordId: sale.id,
        newValue: { amount, paymentMethod, remainingBalance: nextOut },
        reason: 'Customer debt collection recorded',
      });

      return updatedSale;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Debt collection failed.' });
  }
});

// Customer Sales Return (Validates return qty, restocks or marks damaged, refunds account or offsets receivable)
transactionsRouter.post('/sales/:id/return', async (req: AuthRequest, res) => {
  try {
    const saleId = req.params.id;
    const { saleItemId, quantity, refundAccountId, restockType, reason } = req.body;
    const qty = num(quantity);
    if (!saleItemId || qty <= 0 || !reason) {
      return res.status(400).json({ error: 'Sale item, positive return quantity, and reason are required.' });
    }

    const ret = await db.transaction(async (tx) => {
      const today = getYangonToday();
      await assertDayNotClosed(tx, today, req.appUser?.role || 'staff');

      const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
      if (!sale || sale.status === 'cancelled') throw new Error('Sale cannot be returned.');

      const [item] = await tx.select().from(saleItems).where(eq(saleItems.id, saleItemId)).limit(1);
      if (!item || item.saleId !== saleId) throw new Error('Sale item not found.');

      const maxReturn = num(item.quantity) - num(item.returnedQuantity);
      if (qty > maxReturn) {
        throw new Error(`Cannot return ${qty}. Maximum returnable quantity is ${maxReturn}.`);
      }

      const perUnitNet = num(item.lineTotal) / Math.max(1, num(item.quantity));
      const refundAmount = num(req.body.refundAmount ?? perUnitNet * qty);
      const returnNumber = generateRefNumber('SRET');

      await tx
        .update(saleItems)
        .set({ returnedQuantity: toMoney(num(item.returnedQuantity) + qty) })
        .where(eq(saleItems.id, item.id));

      const [prod] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (prod) {
        const isRestock = restockType !== 'damaged';
        const nextStock = isRestock ? num(prod.currentStock) + qty : num(prod.currentStock);
        if (isRestock) {
          await tx
            .update(products)
            .set({ currentStock: toMoney(nextStock), updatedAt: new Date() })
            .where(eq(products.id, prod.id));
        }

        await tx.insert(stockMovements).values({
          productId: prod.id,
          quantity: toMoney(isRestock ? qty : 0),
          movementType: isRestock ? 'sale_return_in' : 'damaged',
          referenceType: 'sale_return',
          referenceId: sale.id,
          referenceNumber: returnNumber,
          previousQty: prod.currentStock,
          newQty: toMoney(nextStock),
          unitCost: item.unitCostSnapshot,
          reason: `${isRestock ? 'Restocked' : 'Damaged'} return: ${reason}`,
          userId: req.appUser?.id,
        });
      }

      // Offset outstanding receivable first, refund remainder from account
      const currentOutstanding = num(sale.outstandingAmount);
      const receivableOffset = Math.min(currentOutstanding, refundAmount);
      const cashRefund = Math.max(0, refundAmount - receivableOffset);

      if (receivableOffset > 0 && sale.customerId) {
        const [cust] = await tx
          .select()
          .from(customers)
          .where(eq(customers.id, sale.customerId))
          .limit(1);
        if (cust) {
          await tx
            .update(customers)
            .set({
              receivableBalance: toMoney(Math.max(0, num(cust.receivableBalance) - receivableOffset)),
            })
            .where(eq(customers.id, cust.id));
        }
      }

      if (cashRefund > 0) {
        const [acc] = refundAccountId
          ? await tx
              .select()
              .from(financialAccounts)
              .where(eq(financialAccounts.id, refundAccountId))
              .limit(1)
          : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
        if (!acc) throw new Error('Refund account is required.');
        const nextBal = num(acc.currentBalance) - cashRefund;
        await tx
          .update(financialAccounts)
          .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
          .where(eq(financialAccounts.id, acc.id));

        await tx.insert(accountTransactions).values({
          accountId: acc.id,
          transactionDate: today,
          direction: 'out',
          amount: toMoney(cashRefund),
          balanceAfter: toMoney(nextBal),
          category: 'Sales Return Refund',
          referenceType: 'sale_refund',
          referenceId: sale.id,
          referenceNumber: returnNumber,
          description: `Refund for ${sale.invoiceNumber} — ${reason}`,
          userId: req.appUser?.id,
        });
      }

      const allItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      const allReturned = allItems.every(
        (it) => num(it.returnedQuantity) + (it.id === item.id ? 0 : 0) >= num(it.quantity)
      );

      await tx
        .update(sales)
        .set({
          outstandingAmount: toMoney(Math.max(0, currentOutstanding - receivableOffset)),
          status: allReturned ? 'returned' : 'partially_returned',
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId));

      const [createdReturn] = await tx
        .insert(saleReturns)
        .values({
          returnNumber,
          saleId,
          saleItemId,
          productId: item.productId,
          quantity: toMoney(qty),
          refundAmount: toMoney(refundAmount),
          refundAccountId: refundAccountId || null,
          restockType: restockType || 'restock',
          reason: String(reason),
          returnDate: today,
          userId: req.appUser?.id,
        })
        .returning();

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'SALES_RETURN',
        module: 'sales',
        recordId: saleId,
        newValue: { returnNumber, qty, refundAmount, restockType },
        reason: String(reason),
      });

      return createdReturn;
    });

    res.status(201).json(ret);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Sales return failed.' });
  }
});

// Controlled Sale Cancellation (Reverses stock & receivables cleanly; never silently deletes)
transactionsRouter.post('/sales/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const saleId = req.params.id;
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 3) {
      return res.status(400).json({ error: 'A cancellation reason is required for audit logs.' });
    }

    const cancelled = await db.transaction(async (tx) => {
      const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
      if (!sale) throw new Error('Sale invoice not found.');
      if (sale.status === 'cancelled') throw new Error('Invoice is already cancelled.');

      await assertDayNotClosed(tx, sale.saleDate, req.appUser?.role || 'staff');

      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      for (const item of items) {
        const netSold = num(item.quantity) - num(item.returnedQuantity);
        if (netSold <= 0) continue;
        const [prod] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (prod) {
          const nextStock = num(prod.currentStock) + netSold;
          await tx
            .update(products)
            .set({ currentStock: toMoney(nextStock), updatedAt: new Date() })
            .where(eq(products.id, prod.id));

          await tx.insert(stockMovements).values({
            productId: prod.id,
            quantity: toMoney(netSold),
            movementType: 'sale_return_in',
            referenceType: 'sale',
            referenceId: sale.id,
            referenceNumber: `VOID-${sale.invoiceNumber}`,
            previousQty: prod.currentStock,
            newQty: toMoney(nextStock),
            unitCost: item.unitCostSnapshot,
            reason: `Cancelled invoice ${sale.invoiceNumber}: ${reason}`,
            userId: req.appUser?.id,
          });
        }
      }

      // Reverse receivables
      if (sale.customerId && num(sale.outstandingAmount) > 0) {
        const [cust] = await tx
          .select()
          .from(customers)
          .where(eq(customers.id, sale.customerId))
          .limit(1);
        if (cust) {
          await tx
            .update(customers)
            .set({
              receivableBalance: toMoney(
                Math.max(0, num(cust.receivableBalance) - num(sale.outstandingAmount))
              ),
            })
            .where(eq(customers.id, cust.id));
        }
      }

      // Reverse paid payments from respective financial accounts
      const payments = await tx.select().from(salePayments).where(eq(salePayments.saleId, saleId));
      for (const pay of payments) {
        const [acc] = await tx
          .select()
          .from(financialAccounts)
          .where(eq(financialAccounts.id, pay.accountId))
          .limit(1);
        if (acc) {
          const nextBal = num(acc.currentBalance) - num(pay.amount);
          await tx
            .update(financialAccounts)
            .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
            .where(eq(financialAccounts.id, acc.id));

          await tx.insert(accountTransactions).values({
            accountId: acc.id,
            transactionDate: getYangonToday(),
            direction: 'out',
            amount: pay.amount,
            balanceAfter: toMoney(nextBal),
            category: 'Cancelled Sale Reversal',
            referenceType: 'sale_refund',
            referenceId: sale.id,
            referenceNumber: `VOID-${sale.invoiceNumber}`,
            description: `Reversal of ${sale.invoiceNumber}: ${reason}`,
            userId: req.appUser?.id,
          });
        }
      }

      const [updated] = await tx
        .update(sales)
        .set({ status: 'cancelled', outstandingAmount: '0.00', updatedAt: new Date() })
        .where(eq(sales.id, saleId))
        .returning();

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CANCEL_SALE',
        module: 'sales',
        recordId: saleId,
        previousValue: { status: sale.status, grandTotal: sale.grandTotal },
        newValue: { status: 'cancelled' },
        reason,
      });

      return updated;
    });

    res.json(cancelled);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Sale cancellation failed.' });
  }
});
