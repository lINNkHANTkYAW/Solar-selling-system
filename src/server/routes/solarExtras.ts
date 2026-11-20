import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  accountTransactions,
  auditLogs,
  businessSettings,
  customers,
  employees,
  expenses,
  financialAccounts,
  incomeRecords,
  packageItems,
  products,
  purchases,
  quotationItems,
  quotations,
  saleItems,
  salePayments,
  sales,
  solarPackages,
  stockMovements,
  suppliers,
  users,
  warrantyClaims,
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

export const solarExtrasRouter = Router();

// ==================== SOLAR PACKAGES & QUOTATIONS ====================

solarExtrasRouter.get('/packages', async (_req, res) => {
  try {
    const [pkgs, items] = await Promise.all([
      db.select().from(solarPackages).orderBy(desc(solarPackages.createdAt)),
      db.select().from(packageItems),
    ]);
    const map = new Map<string, typeof items>();
    for (const i of items) {
      const list = map.get(i.packageId) || [];
      list.push(i);
      map.set(i.packageId, list);
    }
    res.json(pkgs.map((p) => ({ ...p, items: map.get(p.id) || [] })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load solar packages.' });
  }
});

solarExtrasRouter.post('/packages', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.name || items.length === 0) {
      return res.status(400).json({ error: 'Package name and at least one product are required.' });
    }

    const created = await db.transaction(async (tx) => {
      let totalCost = 0;
      let itemsSelling = 0;
      const resolved: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitCost: number;
        unitPrice: number;
      }> = [];

      for (const raw of items) {
        const [prod] = await tx.select().from(products).where(eq(products.id, raw.productId)).limit(1);
        if (!prod) throw new Error('Product in package not found.');
        const qty = Math.max(1, num(raw.quantity));
        const unitCost = num(prod.weightedAvgCost);
        const unitPrice = num(raw.unitPrice ?? prod.sellingPrice);
        totalCost += qty * unitCost;
        itemsSelling += qty * unitPrice;
        resolved.push({ productId: prod.id, productName: prod.name, quantity: qty, unitCost, unitPrice });
      }

      const installationCharge = Math.max(0, num(b.installationCharge));
      const transportCharge = Math.max(0, num(b.transportCharge));
      const discountAmount = Math.max(0, num(b.discountAmount));
      const sellingPrice = Math.max(0, itemsSelling + installationCharge + transportCharge - discountAmount);
      const estimatedProfit = sellingPrice - totalCost;

      const [pkg] = await tx
        .insert(solarPackages)
        .values({
          code: String(b.code || `PKG-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
          name: String(b.name).trim(),
          burmeseName: String(b.burmeseName || b.name).trim(),
          systemCapacityKw: toMoney(num(b.systemCapacityKw || 5)),
          description: String(b.description || ''),
          installationCharge: toMoney(installationCharge),
          transportCharge: toMoney(transportCharge),
          discountAmount: toMoney(discountAmount),
          totalCost: toMoney(totalCost),
          sellingPrice: toMoney(sellingPrice),
          estimatedProfit: toMoney(estimatedProfit),
        })
        .returning();

      for (const item of resolved) {
        await tx.insert(packageItems).values({
          packageId: pkg.id,
          productId: item.productId,
          productName: item.productName,
          quantity: toMoney(item.quantity),
          unitCost: toMoney(item.unitCost),
          unitPrice: toMoney(item.unitPrice),
        });
      }

      return { ...pkg, items: resolved };
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create solar package.' });
  }
});

solarExtrasRouter.delete('/packages/:id', async (req, res) => {
  try {
    await db.delete(solarPackages).where(eq(solarPackages.id, req.params.id));
    res.json({ deleted: true });
  } catch (error) {
    res.status(400).json({ error: 'Cannot delete package referenced by quotations.' });
  }
});

solarExtrasRouter.get('/quotations', async (_req, res) => {
  try {
    const [qtns, items] = await Promise.all([
      db.select().from(quotations).orderBy(desc(quotations.createdAt)),
      db.select().from(quotationItems),
    ]);
    const map = new Map<string, typeof items>();
    for (const i of items) {
      const list = map.get(i.quotationId) || [];
      list.push(i);
      map.set(i.quotationId, list);
    }
    res.json(qtns.map((q) => ({ ...q, items: map.get(q.id) || [] })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load quotations.' });
  }
});

// Create Quotation (NEVER decreases inventory!)
solarExtrasRouter.post('/quotations', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'Quotation requires at least one item.' });
    }

    const created = await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(businessSettings).limit(1);
      let customerName = String(b.customerName || 'Prospective Customer');
      if (b.customerId) {
        const [c] = await tx.select().from(customers).where(eq(customers.id, b.customerId)).limit(1);
        if (c) customerName = c.name;
      }

      let subtotal = 0;
      let totalCost = 0;
      const resolved: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitCost: number;
        unitPrice: number;
        lineTotal: number;
      }> = [];

      for (const raw of items) {
        const [prod] = await tx.select().from(products).where(eq(products.id, raw.productId)).limit(1);
        if (!prod) throw new Error('Product in quotation not found.');
        const qty = Math.max(1, num(raw.quantity));
        const unitCost = num(prod.weightedAvgCost);
        const unitPrice = num(raw.unitPrice ?? prod.sellingPrice);
        const lineTotal = qty * unitPrice;
        subtotal += lineTotal;
        totalCost += qty * unitCost;
        resolved.push({
          productId: prod.id,
          productName: prod.name,
          quantity: qty,
          unitCost,
          unitPrice,
          lineTotal,
        });
      }

      const installationCharge = Math.max(0, num(b.installationCharge));
      const transportCharge = Math.max(0, num(b.transportCharge));
      const discountAmount = Math.max(0, num(b.discountAmount));
      const grandTotal = Math.max(0, subtotal + installationCharge + transportCharge - discountAmount);
      const estimatedProfit = grandTotal - totalCost;

      const today = getYangonToday();
      const validUntil = String(b.validUntil || addMonthsToDate(today, 1));
      const quotationNumber = generateRefNumber(settings?.quotationPrefix || 'QTN');

      const [qtn] = await tx
        .insert(quotations)
        .values({
          quotationNumber,
          customerId: b.customerId || null,
          customerName,
          packageId: b.packageId || null,
          quotationDate: today,
          validUntil,
          subtotal: toMoney(subtotal),
          installationCharge: toMoney(installationCharge),
          transportCharge: toMoney(transportCharge),
          discountAmount: toMoney(discountAmount),
          totalCost: toMoney(totalCost),
          grandTotal: toMoney(grandTotal),
          estimatedProfit: toMoney(estimatedProfit),
          status: String(b.status || 'sent'),
          notes: String(b.notes || ''),
          userId: req.appUser?.id,
        })
        .returning();

      for (const item of resolved) {
        await tx.insert(quotationItems).values({
          quotationId: qtn.id,
          productId: item.productId,
          productName: item.productName,
          quantity: toMoney(item.quantity),
          unitCost: toMoney(item.unitCost),
          unitPrice: toMoney(item.unitPrice),
          lineTotal: toMoney(item.lineTotal),
        });
      }

      return { ...qtn, items: resolved };
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create quotation.' });
  }
});

solarExtrasRouter.patch('/quotations/:id/status', async (req: AuthRequest, res) => {
  try {
    const [updated] = await db
      .update(quotations)
      .set({ status: String(req.body.status), updatedAt: new Date() })
      .where(eq(quotations.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update quotation status.' });
  }
});

// Convert Approved Quotation to Confirmed Sale (Atomically reduces inventory!)
solarExtrasRouter.post('/quotations/:id/convert', async (req: AuthRequest, res) => {
  try {
    const qtnId = req.params.id;
    const paymentMethod = String(req.body.paymentMethod || 'Cash');
    const paidAmount = Math.max(0, num(req.body.paidAmount));
    const accountId = req.body.accountId;

    const sale = await db.transaction(async (tx) => {
      const today = getYangonToday();
      await assertDayNotClosed(tx, today, req.appUser?.role || 'staff');

      const [settings] = await tx.select().from(businessSettings).limit(1);
      const [qtn] = await tx.select().from(quotations).where(eq(quotations.id, qtnId)).limit(1);
      if (!qtn) throw new Error('Quotation not found.');
      if (qtn.status === 'converted') throw new Error('Quotation has already been converted to a sale.');

      const qItems = await tx.select().from(quotationItems).where(eq(quotationItems.quotationId, qtnId));
      if (qItems.length === 0) throw new Error('Quotation has no line items.');

      let totalCogs = 0;
      const prodSnapshots: Array<{ qItem: typeof qItems[0]; prod: typeof products.$inferSelect }> = [];
      for (const qItem of qItems) {
        const [prod] = await tx.select().from(products).where(eq(products.id, qItem.productId)).limit(1);
        if (!prod) throw new Error(`Product ${qItem.productName} no longer exists.`);
        const qty = num(qItem.quantity);
        if (num(prod.currentStock) - qty < 0 && !settings?.allowNegativeStock) {
          throw new Error(
            `Cannot convert quotation: insufficient stock for ${prod.name} (Available: ${prod.currentStock}, Needed: ${qty}).`
          );
        }
        totalCogs += qty * num(prod.weightedAvgCost);
        prodSnapshots.push({ qItem, prod });
      }

      const additionalCharges = num(qtn.installationCharge) + num(qtn.transportCharge);
      const grandTotal = num(qtn.grandTotal);
      const actualPaid = Math.min(paidAmount, grandTotal);
      const outstandingAmount = Math.max(0, grandTotal - actualPaid);

      if (outstandingAmount > 0 && !qtn.customerId) {
        throw new Error('Link a registered customer before converting to a credit/partial-payment sale.');
      }

      const invoiceNumber = generateRefNumber(settings?.invoicePrefix || 'INV');
      const [createdSale] = await tx
        .insert(sales)
        .values({
          invoiceNumber,
          customerId: qtn.customerId,
          customerName: qtn.customerName,
          saleDate: today,
          subtotal: qtn.subtotal,
          itemDiscountTotal: '0.00',
          overallDiscount: qtn.discountAmount,
          additionalCharges: toMoney(additionalCharges),
          taxAmount: '0.00',
          grandTotal: toMoney(grandTotal),
          paidAmount: toMoney(actualPaid),
          outstandingAmount: toMoney(outstandingAmount),
          totalCogs: toMoney(totalCogs),
          grossProfit: toMoney(grandTotal - totalCogs),
          status: outstandingAmount <= 0.01 ? 'fully_paid' : actualPaid > 0 ? 'partially_paid' : 'completed',
          paymentMethod,
          notes: `Converted from Quotation ${qtn.quotationNumber}. ${qtn.notes || ''}`,
          salespersonId: req.appUser?.id,
          quotationId: qtn.id,
        })
        .returning();

      for (const { qItem, prod } of prodSnapshots) {
        const qty = num(qItem.quantity);
        await tx.insert(saleItems).values({
          saleId: createdSale.id,
          productId: prod.id,
          productName: prod.name,
          burmeseName: prod.burmeseName,
          quantity: qItem.quantity,
          unitPrice: qItem.unitPrice,
          unitCostSnapshot: prod.weightedAvgCost,
          discountAmount: '0.00',
          lineTotal: qItem.lineTotal,
          warrantyMonths: prod.warrantyMonths,
        });

        const nextStock = num(prod.currentStock) - qty;
        await tx
          .update(products)
          .set({ currentStock: toMoney(nextStock), updatedAt: new Date() })
          .where(eq(products.id, prod.id));

        await tx.insert(stockMovements).values({
          productId: prod.id,
          quantity: toMoney(-qty),
          movementType: 'sale_out',
          referenceType: 'sale',
          referenceId: createdSale.id,
          referenceNumber: createdSale.invoiceNumber,
          previousQty: prod.currentStock,
          newQty: toMoney(nextStock),
          unitCost: prod.weightedAvgCost,
          reason: `Converted Quotation ${qtn.quotationNumber} -> ${createdSale.invoiceNumber}`,
          userId: req.appUser?.id,
        });
      }

      if (qtn.customerId && outstandingAmount > 0) {
        const [cust] = await tx.select().from(customers).where(eq(customers.id, qtn.customerId)).limit(1);
        if (cust) {
          await tx
            .update(customers)
            .set({ receivableBalance: toMoney(num(cust.receivableBalance) + outstandingAmount) })
            .where(eq(customers.id, cust.id));
        }
      }

      if (actualPaid > 0) {
        const [acc] = accountId
          ? await tx.select().from(financialAccounts).where(eq(financialAccounts.id, accountId)).limit(1)
          : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
        if (acc) {
          const nextBal = num(acc.currentBalance) + actualPaid;
          await tx
            .update(financialAccounts)
            .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
            .where(eq(financialAccounts.id, acc.id));

          await tx.insert(salePayments).values({
            saleId: createdSale.id,
            customerId: qtn.customerId,
            accountId: acc.id,
            paymentDate: today,
            amount: toMoney(actualPaid),
            paymentMethod,
            isDebtCollection: false,
            referenceNote: `Payment on quotation conversion ${qtn.quotationNumber}`,
            idempotencyKey: `${createdSale.id}-qtn-conv`,
            userId: req.appUser?.id,
          });

          await tx.insert(accountTransactions).values({
            accountId: acc.id,
            transactionDate: today,
            direction: 'in',
            amount: toMoney(actualPaid),
            balanceAfter: toMoney(nextBal),
            category: 'Product Sales',
            referenceType: 'sale_payment',
            referenceId: createdSale.id,
            referenceNumber: createdSale.invoiceNumber,
            description: `Quotation ${qtn.quotationNumber} converted to ${createdSale.invoiceNumber}`,
            userId: req.appUser?.id,
          });
        }
      }

      await tx
        .update(quotations)
        .set({ status: 'converted', convertedSaleId: createdSale.id, updatedAt: new Date() })
        .where(eq(quotations.id, qtn.id));

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CONVERT_QUOTATION_TO_SALE',
        module: 'quotations',
        recordId: qtn.id,
        newValue: { quotationNumber: qtn.quotationNumber, invoiceNumber: createdSale.invoiceNumber },
        reason: 'Converted approved quotation to confirmed sale',
      });

      return createdSale;
    });

    res.status(201).json(sale);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to convert quotation to sale.' });
  }
});

// ==================== WARRANTY & SERIAL NUMBERS ====================

solarExtrasRouter.get('/warranties', async (_req, res) => {
  try {
    const today = getYangonToday();
    const in30 = new Date(today + 'T00:00:00Z');
    in30.setUTCDate(in30.getUTCDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);

    const [records, claims] = await Promise.all([
      db.select().from(warrantyRecords).orderBy(desc(warrantyRecords.createdAt)),
      db.select().from(warrantyClaims).orderBy(desc(warrantyClaims.createdAt)),
    ]);

    const claimsByWar = new Map<string, typeof claims>();
    for (const c of claims) {
      const list = claimsByWar.get(c.warrantyId) || [];
      list.push(c);
      claimsByWar.set(c.warrantyId, list);
    }

    const enriched = records.map((w) => {
      let computedStatus = w.status;
      if (w.status === 'active' || w.status === 'expiring_soon') {
        if (w.warrantyEndDate < today) computedStatus = 'expired';
        else if (w.warrantyEndDate <= in30Str) computedStatus = 'expiring_soon';
        else computedStatus = 'active';
      }
      return { ...w, status: computedStatus, claims: claimsByWar.get(w.id) || [] };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load warranty records.' });
  }
});

solarExtrasRouter.post('/warranties', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.serialNumber || !b.productId) {
      return res.status(400).json({ error: 'Serial number and product are required.' });
    }
    const [prod] = await db.select().from(products).where(eq(products.id, b.productId)).limit(1);
    if (!prod) return res.status(404).json({ error: 'Product not found.' });

    const saleDate = String(b.saleDate || getYangonToday());
    const months = Number(b.warrantyMonths || prod.warrantyMonths || 12);
    const [created] = await db
      .insert(warrantyRecords)
      .values({
        serialNumber: String(b.serialNumber).trim().toUpperCase(),
        productId: prod.id,
        productName: prod.name,
        customerId: b.customerId || null,
        customerName: String(b.customerName || ''),
        customerPhone: String(b.customerPhone || ''),
        invoiceNumber: String(b.invoiceNumber || ''),
        saleDate,
        warrantyStartDate: String(b.warrantyStartDate || saleDate),
        warrantyEndDate: String(b.warrantyEndDate || addMonthsToDate(saleDate, months)),
        warrantyMonths: months,
        status: 'active',
        notes: String(b.notes || ''),
      })
      .returning();

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to register warranty.' });
  }
});

solarExtrasRouter.post('/warranties/:id/claims', async (req: AuthRequest, res) => {
  try {
    const warrantyId = req.params.id;
    const { issueDescription, status, resolutionNotes, replacementSerial } = req.body;
    if (!issueDescription) return res.status(400).json({ error: 'Issue description is required.' });

    const claim = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(warrantyClaims)
        .values({
          warrantyId,
          claimDate: getYangonToday(),
          issueDescription: String(issueDescription),
          resolutionNotes: String(resolutionNotes || ''),
          replacementSerial: String(replacementSerial || ''),
          status: String(status || 'open'),
          userId: req.appUser?.id,
        })
        .returning();

      const nextWarStatus = status === 'replaced' ? 'replaced' : 'under_claim';
      await tx
        .update(warrantyRecords)
        .set({ status: nextWarStatus, updatedAt: new Date() })
        .where(eq(warrantyRecords.id, warrantyId));

      return created;
    });

    res.status(201).json(claim);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to submit warranty claim.' });
  }
});

solarExtrasRouter.patch('/warranties/claims/:claimId', async (req: AuthRequest, res) => {
  try {
    const claimId = req.params.claimId;
    const { status, resolutionNotes, replacementSerial } = req.body;
    const [updated] = await db
      .update(warrantyClaims)
      .set({
        status: status || 'closed',
        resolutionNotes: resolutionNotes ?? '',
        replacementSerial: replacementSerial ?? '',
        updatedAt: new Date(),
      })
      .where(eq(warrantyClaims.id, claimId))
      .returning();

    if (updated) {
      const warStatus =
        status === 'replaced' ? 'replaced' : status === 'closed' || status === 'rejected' ? 'active' : 'under_claim';
      await db
        .update(warrantyRecords)
        .set({ status: warStatus, updatedAt: new Date() })
        .where(eq(warrantyRecords.id, updated.warrantyId));
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update claim.' });
  }
});

// ==================== EMPLOYEES, USERS & AUDIT LOGS ====================

solarExtrasRouter.get('/employees', async (_req, res) => {
  try {
    const [empRows, userRows] = await Promise.all([
      db.select().from(employees).orderBy(desc(employees.createdAt)),
      db.select().from(users).orderBy(desc(users.createdAt)),
    ]);
    res.json({ employees: empRows, users: userRows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load employees and users.' });
  }
});

solarExtrasRouter.post('/employees', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.fullName || !b.position) {
      return res.status(400).json({ error: 'Employee name and position are required.' });
    }
    const [created] = await db
      .insert(employees)
      .values({
        employeeCode: String(b.employeeCode || `EMP-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
        fullName: String(b.fullName).trim(),
        phone: String(b.phone || '').trim(),
        position: String(b.position).trim(),
        monthlySalary: toMoney(num(b.monthlySalary)),
        joiningDate: String(b.joiningDate || getYangonToday()),
        status: String(b.status || 'active'),
        role: String(b.role || 'staff'),
        notes: String(b.notes || ''),
      })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to add employee.' });
  }
});

solarExtrasRouter.put('/employees/:id', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const [updated] = await db
      .update(employees)
      .set({
        fullName: b.fullName,
        phone: b.phone ?? '',
        position: b.position,
        monthlySalary: toMoney(num(b.monthlySalary)),
        joiningDate: b.joiningDate,
        status: b.status || 'active',
        role: b.role || 'staff',
        notes: b.notes ?? '',
        updatedAt: new Date(),
      })
      .where(eq(employees.id, req.params.id))
      .returning();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update employee.' });
  }
});

// Pay Employee Salary -> Atomically records Employee Salary expense + financial account outflow
solarExtrasRouter.post('/employees/:id/pay-salary', async (req: AuthRequest, res) => {
  try {
    const empId = req.params.id;
    const { accountId, monthLabel, amount } = req.body;
    const [emp] = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const payAmount = num(amount ?? emp.monthlySalary);
    if (payAmount <= 0) return res.status(400).json({ error: 'Salary amount must be greater than zero.' });

    const today = getYangonToday();
    const exp = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, today, req.appUser?.role || 'staff');
      const [acc] = accountId
        ? await tx.select().from(financialAccounts).where(eq(financialAccounts.id, accountId)).limit(1)
        : await tx.select().from(financialAccounts).where(eq(financialAccounts.isDefault, true)).limit(1);
      if (!acc) throw new Error('Payment account not found.');

      const nextBal = num(acc.currentBalance) - payAmount;
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, acc.id));

      const expenseNumber = generateRefNumber('SAL');
      const descText = `Salary Payment — ${emp.fullName} (${monthLabel || today.slice(0, 7)})`;
      const [createdExp] = await tx
        .insert(expenses)
        .values({
          expenseNumber,
          category: 'Employee Salary',
          description: descText,
          amount: toMoney(payAmount),
          expenseDate: today,
          accountId: acc.id,
          paymentMethod: acc.accountType,
          userId: req.appUser?.id,
        })
        .returning();

      await tx.insert(accountTransactions).values({
        accountId: acc.id,
        transactionDate: today,
        direction: 'out',
        amount: toMoney(payAmount),
        balanceAfter: toMoney(nextBal),
        category: 'Employee Salary',
        referenceType: 'expense',
        referenceId: createdExp.id,
        referenceNumber: expenseNumber,
        description: descText,
        userId: req.appUser?.id,
      });

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'PAY_SALARY',
        module: 'employees',
        recordId: emp.id,
        newValue: { employee: emp.fullName, amount: payAmount, expenseNumber },
        reason: descText,
      });

      return createdExp;
    });

    res.status(201).json(exp);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Salary disbursement failed.' });
  }
});

solarExtrasRouter.patch('/users/:id/role', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const role = String(req.body.role || 'staff');
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await writeAuditLog(db, {
      userId: req.appUser?.id,
      userEmail: req.appUser?.email,
      action: 'UPDATE_USER_ROLE',
      module: 'users',
      recordId: id,
      previousValue: { role: existing.role },
      newValue: { role },
      reason: 'User role permissions updated',
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: 'Failed to update user role.' });
  }
});

solarExtrasRouter.get('/audit-logs', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// ==================== REPORTS CENTER ====================

solarExtrasRouter.get('/reports', async (req, res) => {
  try {
    const startDate = String(req.query.startDate || `${getYangonToday().slice(0, 7)}-01`);
    const endDate = String(req.query.endDate || getYangonToday());

    const [
      allSales,
      allSaleItems,
      allPurchases,
      allProducts,
      allCustomers,
      allSuppliers,
      allExpenses,
      allIncome,
      allAccountTx,
      allAccounts,
      allMovements,
    ] = await Promise.all([
      db.select().from(sales).orderBy(desc(sales.saleDate)),
      db.select().from(saleItems),
      db.select().from(purchases).orderBy(desc(purchases.purchaseDate)),
      db.select().from(products).where(eq(products.isActive, true)),
      db.select().from(customers).where(eq(customers.isActive, true)),
      db.select().from(suppliers).where(eq(suppliers.isActive, true)),
      db.select().from(expenses).orderBy(desc(expenses.expenseDate)),
      db.select().from(incomeRecords).orderBy(desc(incomeRecords.incomeDate)),
      db.select().from(accountTransactions).orderBy(desc(accountTransactions.transactionDate)),
      db.select().from(financialAccounts),
      db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)),
    ]);

    const validSales = allSales.filter(
      (s) => s.status !== 'draft' && s.status !== 'cancelled' && s.saleDate >= startDate && s.saleDate <= endDate
    );
    const validSaleIds = new Set(validSales.map((s) => s.id));
    const filteredPurchases = allPurchases.filter(
      (p) => p.status !== 'draft' && p.status !== 'cancelled' && p.purchaseDate >= startDate && p.purchaseDate <= endDate
    );
    const filteredExpenses = allExpenses.filter(
      (e) => e.expenseDate >= startDate && e.expenseDate <= endDate
    );
    const filteredIncome = allIncome.filter(
      (i) => i.incomeDate >= startDate && i.incomeDate <= endDate
    );
    const filteredCashFlow = allAccountTx.filter(
      (t) => t.transactionDate >= startDate && t.transactionDate <= endDate
    );

    // Product Sales Summary (Fast/Slow moving)
    const prodSalesMap = new Map<
      string,
      { productId: string; productName: string; qtySold: number; revenue: number; cogs: number; profit: number }
    >();
    for (const item of allSaleItems) {
      if (!validSaleIds.has(item.saleId)) continue;
      const qty = num(item.quantity) - num(item.returnedQuantity);
      const rev = num(item.lineTotal);
      const cost = qty * num(item.unitCostSnapshot);
      const e = prodSalesMap.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        qtySold: 0,
        revenue: 0,
        cogs: 0,
        profit: 0,
      };
      e.qtySold += qty;
      e.revenue += rev;
      e.cogs += cost;
      e.profit += rev - cost;
      prodSalesMap.set(item.productId, e);
    }

    // Customer Sales Summary
    const custSalesMap = new Map<
      string,
      { customerName: string; invoices: number; totalSales: number; paid: number; outstanding: number }
    >();
    for (const s of validSales) {
      const key = s.customerId || s.customerName;
      const e = custSalesMap.get(key) || {
        customerName: s.customerName,
        invoices: 0,
        totalSales: 0,
        paid: 0,
        outstanding: 0,
      };
      e.invoices += 1;
      e.totalSales += num(s.grandTotal);
      e.paid += num(s.paidAmount);
      e.outstanding += num(s.outstandingAmount);
      custSalesMap.set(key, e);
    }

    const supMap = new Map(allSuppliers.map((s) => [s.id, s.name]));
    const accMap = new Map(allAccounts.map((a) => [a.id, a.name]));

    res.json({
      range: { startDate, endDate },
      salesReport: validSales,
      productSalesReport: Array.from(prodSalesMap.values()).sort((a, b) => b.revenue - a.revenue),
      customerSalesReport: Array.from(custSalesMap.values()).sort((a, b) => b.totalSales - a.totalSales),
      inventoryValuation: allProducts.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        burmeseName: p.burmeseName,
        brand: p.brand,
        unit: p.unit,
        currentStock: num(p.currentStock),
        minStockLevel: p.minStockLevel,
        weightedAvgCost: num(p.weightedAvgCost),
        sellingPrice: num(p.sellingPrice),
        valuation: num(p.currentStock) * num(p.weightedAvgCost),
        potentialRevenue: num(p.currentStock) * num(p.sellingPrice),
      })),
      stockAdjustments: allMovements
        .filter((m) => m.referenceType === 'adjustment' || m.movementType === 'damaged')
        .slice(0, 100),
      expenseReport: filteredExpenses.map((e) => ({ ...e, accountName: accMap.get(e.accountId) || '' })),
      incomeReport: filteredIncome.map((i) => ({ ...i, accountName: accMap.get(i.accountId) || '' })),
      cashFlowReport: filteredCashFlow.map((t) => ({ ...t, accountName: accMap.get(t.accountId) || '' })),
      receivablesReport: allCustomers.filter((c) => num(c.receivableBalance) > 0),
      payablesReport: allSuppliers.filter((s) => num(s.payableBalance) > 0),
      purchaseReport: filteredPurchases.map((p) => ({
        ...p,
        supplierName: supMap.get(p.supplierId) || 'Supplier',
      })),
    });
  } catch (error) {
    console.error('Reports generation failed:', error);
    res.status(500).json({ error: 'Failed to compile reports.' });
  }
});
