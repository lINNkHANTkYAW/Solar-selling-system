import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  accountTransactions,
  accountTransfers,
  customers,
  dailyClosings,
  expenses,
  financialAccounts,
  incomeRecords,
  monthlyClosings,
  products,
  purchasePayments,
  purchaseReturns,
  purchases,
  salePayments,
  saleReturns,
  sales,
  suppliers,
  warrantyRecords,
} from '../../db/schema.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import {
  assertDayNotClosed,
  generateRefNumber,
  getYangonMonth,
  getYangonToday,
  num,
  toMoney,
  writeAuditLog,
} from '../helpers.ts';

export const crmFinanceRouter = Router();

// ==================== CUSTOMERS ====================

crmFinanceRouter.get('/customers', async (_req, res) => {
  try {
    const [custRows, saleRows] = await Promise.all([
      db.select().from(customers).orderBy(desc(customers.createdAt)),
      db.select().from(sales),
    ]);

    const totalsMap = new Map<string, { totalPurchases: number; totalPayments: number; invoiceCount: number }>();
    for (const s of saleRows) {
      if (!s.customerId || s.status === 'cancelled' || s.status === 'draft') continue;
      const e = totalsMap.get(s.customerId) || { totalPurchases: 0, totalPayments: 0, invoiceCount: 0 };
      e.totalPurchases += num(s.grandTotal);
      e.totalPayments += num(s.paidAmount);
      e.invoiceCount += 1;
      totalsMap.set(s.customerId, e);
    }

    res.json(
      custRows.map((c) => {
        const stats = totalsMap.get(c.id) || { totalPurchases: 0, totalPayments: 0, invoiceCount: 0 };
        return { ...c, ...stats };
      })
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to load customers.' });
  }
});

crmFinanceRouter.get('/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const [custSales, custPayments, custWarranties, allReturns] = await Promise.all([
      db.select().from(sales).where(eq(sales.customerId, id)).orderBy(desc(sales.createdAt)),
      db.select().from(salePayments).where(eq(salePayments.customerId, id)).orderBy(desc(salePayments.createdAt)),
      db.select().from(warrantyRecords).where(eq(warrantyRecords.customerId, id)).orderBy(desc(warrantyRecords.createdAt)),
      db.select().from(saleReturns).orderBy(desc(saleReturns.createdAt)),
    ]);

    const saleIds = new Set(custSales.map((s) => s.id));
    const returns = allReturns.filter((r) => saleIds.has(r.saleId));

    res.json({
      customer,
      sales: custSales,
      payments: custPayments,
      warranties: custWarranties,
      returns,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load customer profile.' });
  }
});

crmFinanceRouter.post('/customers', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Customer name is required.' });
    const [created] = await db
      .insert(customers)
      .values({
        code: String(b.code || `CUS-${Math.floor(10000 + Math.random() * 89999)}`).toUpperCase(),
        name: String(b.name).trim(),
        phone: String(b.phone || '').trim(),
        secondaryPhone: String(b.secondaryPhone || '').trim(),
        address: String(b.address || '').trim(),
        township: String(b.township || '').trim(),
        customerType: String(b.customerType || 'retail'),
        priceTier: String(b.priceTier || (b.customerType === 'wholesale' || b.customerType === 'installer' ? 'wholesale' : 'retail')),
        defaultDiscountPct: toMoney(num(b.defaultDiscountPct)),
        notes: String(b.notes || ''),
      })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create customer.' });
  }
});

crmFinanceRouter.put('/customers/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const b = req.body;
    const [updated] = await db
      .update(customers)
      .set({
        name: b.name,
        phone: b.phone,
        secondaryPhone: b.secondaryPhone ?? '',
        address: b.address ?? '',
        township: b.township ?? '',
        customerType: b.customerType ?? 'retail',
        priceTier: b.priceTier ?? 'retail',
        defaultDiscountPct: toMoney(num(b.defaultDiscountPct)),
        notes: b.notes ?? '',
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update customer.' });
  }
});

// ==================== SUPPLIERS ====================

crmFinanceRouter.get('/suppliers', async (_req, res) => {
  try {
    const [supRows, purRows] = await Promise.all([
      db.select().from(suppliers).orderBy(desc(suppliers.createdAt)),
      db.select().from(purchases),
    ]);

    const totalsMap = new Map<string, { totalPurchases: number; totalPayments: number; orderCount: number }>();
    for (const p of purRows) {
      if (p.status === 'cancelled' || p.status === 'draft') continue;
      const e = totalsMap.get(p.supplierId) || { totalPurchases: 0, totalPayments: 0, orderCount: 0 };
      e.totalPurchases += num(p.totalAmount);
      e.totalPayments += num(p.paidAmount);
      e.orderCount += 1;
      totalsMap.set(p.supplierId, e);
    }

    res.json(
      supRows.map((s) => {
        const stats = totalsMap.get(s.id) || { totalPurchases: 0, totalPayments: 0, orderCount: 0 };
        return { ...s, ...stats };
      })
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to load suppliers.' });
  }
});

crmFinanceRouter.get('/suppliers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });

    const [supPurchases, supPayments, allReturns] = await Promise.all([
      db.select().from(purchases).where(eq(purchases.supplierId, id)).orderBy(desc(purchases.createdAt)),
      db
        .select()
        .from(purchasePayments)
        .where(eq(purchasePayments.supplierId, id))
        .orderBy(desc(purchasePayments.createdAt)),
      db.select().from(purchaseReturns).orderBy(desc(purchaseReturns.createdAt)),
    ]);

    const purIds = new Set(supPurchases.map((p) => p.id));
    const returns = allReturns.filter((r) => purIds.has(r.purchaseId));

    res.json({ supplier, purchases: supPurchases, payments: supPayments, returns });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load supplier profile.' });
  }
});

crmFinanceRouter.post('/suppliers', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Supplier name is required.' });
    const [created] = await db
      .insert(suppliers)
      .values({
        code: String(b.code || `SUP-${Math.floor(10000 + Math.random() * 89999)}`).toUpperCase(),
        name: String(b.name).trim(),
        contactPerson: String(b.contactPerson || '').trim(),
        phone: String(b.phone || '').trim(),
        email: String(b.email || '').trim(),
        address: String(b.address || '').trim(),
        notes: String(b.notes || ''),
      })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create supplier.' });
  }
});

crmFinanceRouter.put('/suppliers/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const b = req.body;
    const [updated] = await db
      .update(suppliers)
      .set({
        name: b.name,
        contactPerson: b.contactPerson ?? '',
        phone: b.phone ?? '',
        email: b.email ?? '',
        address: b.address ?? '',
        notes: b.notes ?? '',
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, id))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update supplier.' });
  }
});

// ==================== FINANCIAL ACCOUNTS, TRANSFERS, INCOME & EXPENSES ====================

crmFinanceRouter.get('/accounts', async (_req, res) => {
  try {
    const accs = await db.select().from(financialAccounts).orderBy(financialAccounts.name);
    res.json(accs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load financial accounts.' });
  }
});

crmFinanceRouter.post('/accounts', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.accountType) {
      return res.status(400).json({ error: 'Account name and type are required.' });
    }
    const opening = Math.max(0, num(b.openingBalance));
    const created = await db.transaction(async (tx) => {
      const [acc] = await tx
        .insert(financialAccounts)
        .values({
          name: String(b.name).trim(),
          accountType: String(b.accountType),
          bankName: String(b.bankName || ''),
          accountNumber: String(b.accountNumber || ''),
          openingBalance: toMoney(opening),
          currentBalance: toMoney(opening),
        })
        .returning();

      if (opening > 0) {
        await tx.insert(accountTransactions).values({
          accountId: acc.id,
          transactionDate: getYangonToday(),
          direction: 'in',
          amount: toMoney(opening),
          balanceAfter: toMoney(opening),
          category: 'Opening Balance',
          referenceType: 'opening',
          referenceNumber: `OPEN-${acc.id.slice(0, 6).toUpperCase()}`,
          description: `Opening balance for ${acc.name}`,
          userId: req.appUser?.id,
        });
      }
      return acc;
    });
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create financial account.' });
  }
});

crmFinanceRouter.get('/accounts/:id/ledger', async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await db
      .select()
      .from(accountTransactions)
      .where(eq(accountTransactions.accountId, id))
      .orderBy(desc(accountTransactions.createdAt))
      .limit(200);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load account ledger.' });
  }
});

// Internal Account Transfer (NEVER counts as income or expense!)
crmFinanceRouter.post('/accounts/transfer', async (req: AuthRequest, res) => {
  try {
    const { fromAccountId, toAccountId, amount, transferDate, notes } = req.body;
    const amt = num(amount);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || amt <= 0) {
      return res.status(400).json({ error: 'Select two different accounts and enter a positive transfer amount.' });
    }
    const date = String(transferDate || getYangonToday());

    const transfer = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, date, req.appUser?.role || 'staff');
      const [fromAcc] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, fromAccountId))
        .limit(1);
      const [toAcc] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, toAccountId))
        .limit(1);
      if (!fromAcc || !toAcc) throw new Error('Account not found.');

      const fromNext = num(fromAcc.currentBalance) - amt;
      const toNext = num(toAcc.currentBalance) + amt;

      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(fromNext), updatedAt: new Date() })
        .where(eq(financialAccounts.id, fromAcc.id));

      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(toNext), updatedAt: new Date() })
        .where(eq(financialAccounts.id, toAcc.id));

      const transferNumber = generateRefNumber('TRF');
      const [trf] = await tx
        .insert(accountTransfers)
        .values({
          transferNumber,
          fromAccountId: fromAcc.id,
          toAccountId: toAcc.id,
          amount: toMoney(amt),
          transferDate: date,
          notes: String(notes || ''),
          userId: req.appUser?.id,
        })
        .returning();

      await tx.insert(accountTransactions).values([
        {
          accountId: fromAcc.id,
          transactionDate: date,
          direction: 'out',
          amount: toMoney(amt),
          balanceAfter: toMoney(fromNext),
          category: 'Internal Transfer',
          referenceType: 'transfer_out',
          referenceId: trf.id,
          referenceNumber: transferNumber,
          description: `Transfer to ${toAcc.name}${notes ? ` — ${notes}` : ''}`,
          userId: req.appUser?.id,
        },
        {
          accountId: toAcc.id,
          transactionDate: date,
          direction: 'in',
          amount: toMoney(amt),
          balanceAfter: toMoney(toNext),
          category: 'Internal Transfer',
          referenceType: 'transfer_in',
          referenceId: trf.id,
          referenceNumber: transferNumber,
          description: `Transfer from ${fromAcc.name}${notes ? ` — ${notes}` : ''}`,
          userId: req.appUser?.id,
        },
      ]);

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'ACCOUNT_TRANSFER',
        module: 'finance',
        recordId: trf.id,
        newValue: { from: fromAcc.name, to: toAcc.name, amount: amt },
        reason: notes || 'Internal fund transfer',
      });

      return trf;
    });

    res.status(201).json(transfer);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Transfer failed.' });
  }
});

// Expenses
crmFinanceRouter.get('/expenses', async (_req, res) => {
  try {
    const [expRows, accRows] = await Promise.all([
      db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)),
      db.select().from(financialAccounts),
    ]);
    const accMap = new Map(accRows.map((a) => [a.id, a.name]));
    res.json(expRows.map((e) => ({ ...e, accountName: accMap.get(e.accountId) || '' })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load expenses.' });
  }
});

crmFinanceRouter.post('/expenses', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const amount = num(b.amount);
    if (!b.category || !b.description || amount <= 0 || !b.accountId) {
      return res.status(400).json({ error: 'Category, description, positive amount, and account are required.' });
    }
    const expenseDate = String(b.expenseDate || getYangonToday());

    const created = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, expenseDate, req.appUser?.role || 'staff');
      const [acc] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, b.accountId))
        .limit(1);
      if (!acc) throw new Error('Payment account not found.');

      const nextBal = num(acc.currentBalance) - amount;
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, acc.id));

      const expenseNumber = generateRefNumber('EXP');
      const [exp] = await tx
        .insert(expenses)
        .values({
          expenseNumber,
          category: String(b.category),
          description: String(b.description).trim(),
          amount: toMoney(amount),
          expenseDate,
          accountId: acc.id,
          paymentMethod: String(b.paymentMethod || acc.accountType),
          receiptUrl: String(b.receiptUrl || ''),
          notes: String(b.notes || ''),
          userId: req.appUser?.id,
        })
        .returning();

      await tx.insert(accountTransactions).values({
        accountId: acc.id,
        transactionDate: expenseDate,
        direction: 'out',
        amount: toMoney(amount),
        balanceAfter: toMoney(nextBal),
        category: exp.category,
        referenceType: 'expense',
        referenceId: exp.id,
        referenceNumber: expenseNumber,
        description: `${exp.category}: ${exp.description}`,
        userId: req.appUser?.id,
      });

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CREATE_EXPENSE',
        module: 'finance',
        recordId: exp.id,
        newValue: { expenseNumber, category: exp.category, amount },
        reason: exp.description,
      });

      return exp;
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record expense.' });
  }
});

// Other Income
crmFinanceRouter.get('/income', async (_req, res) => {
  try {
    const [incRows, accRows] = await Promise.all([
      db.select().from(incomeRecords).orderBy(desc(incomeRecords.incomeDate), desc(incomeRecords.createdAt)),
      db.select().from(financialAccounts),
    ]);
    const accMap = new Map(accRows.map((a) => [a.id, a.name]));
    res.json(incRows.map((i) => ({ ...i, accountName: accMap.get(i.accountId) || '' })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load income records.' });
  }
});

crmFinanceRouter.post('/income', async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const amount = num(b.amount);
    if (!b.category || !b.description || amount <= 0 || !b.accountId) {
      return res.status(400).json({ error: 'Category, description, positive amount, and account are required.' });
    }
    const incomeDate = String(b.incomeDate || getYangonToday());

    const created = await db.transaction(async (tx) => {
      await assertDayNotClosed(tx, incomeDate, req.appUser?.role || 'staff');
      const [acc] = await tx
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.id, b.accountId))
        .limit(1);
      if (!acc) throw new Error('Account not found.');

      const nextBal = num(acc.currentBalance) + amount;
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(nextBal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, acc.id));

      const incomeNumber = generateRefNumber('INC');
      const [inc] = await tx
        .insert(incomeRecords)
        .values({
          incomeNumber,
          category: String(b.category),
          description: String(b.description).trim(),
          amount: toMoney(amount),
          incomeDate,
          accountId: acc.id,
          paymentMethod: String(b.paymentMethod || acc.accountType),
          notes: String(b.notes || ''),
          userId: req.appUser?.id,
        })
        .returning();

      await tx.insert(accountTransactions).values({
        accountId: acc.id,
        transactionDate: incomeDate,
        direction: 'in',
        amount: toMoney(amount),
        balanceAfter: toMoney(nextBal),
        category: inc.category,
        referenceType: 'income',
        referenceId: inc.id,
        referenceNumber: incomeNumber,
        description: `${inc.category}: ${inc.description}`,
        userId: req.appUser?.id,
      });

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CREATE_INCOME',
        module: 'finance',
        recordId: inc.id,
        newValue: { incomeNumber, category: inc.category, amount },
        reason: inc.description,
      });

      return inc;
    });

    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record income.' });
  }
});

// ==================== DAILY CLOSING ====================

async function computeDailyClosingPreview(businessDate: string) {
  const [accs, allTx, allSalePays, allPurPays, allExp, allInc, existingClosings] = await Promise.all([
    db.select().from(financialAccounts),
    db.select().from(accountTransactions),
    db.select().from(salePayments),
    db.select().from(purchasePayments),
    db.select().from(expenses),
    db.select().from(incomeRecords),
    db.select().from(dailyClosings).where(eq(dailyClosings.businessDate, businessDate)).limit(1),
  ]);

  const cashAccIds = new Set(accs.filter((a) => a.accountType === 'cash').map((a) => a.id));

  // Opening Cash = Sum of cash accounts openingBalance + all cash tx strictly BEFORE businessDate (excluding opening tx if already in openingBalance)
  let openingCash = 0;
  for (const acc of accs.filter((a) => a.accountType === 'cash')) {
    let bal = num(acc.openingBalance);
    for (const t of allTx) {
      if (t.accountId !== acc.id) continue;
      if (t.transactionDate < businessDate && t.referenceType !== 'opening') {
        bal += t.direction === 'in' ? num(t.amount) : -num(t.amount);
      }
      if (t.transactionDate < businessDate && t.referenceType === 'opening' && num(acc.openingBalance) === 0) {
        bal += num(t.amount);
      }
    }
    openingCash += bal;
  }

  // Today's cash vs digital flows
  const daySalePays = allSalePays.filter((p) => p.paymentDate === businessDate);
  const cashSales = daySalePays
    .filter((p) => !p.isDebtCollection && cashAccIds.has(p.accountId))
    .reduce((s, p) => s + num(p.amount), 0);
  const digitalSales = daySalePays
    .filter((p) => !p.isDebtCollection && !cashAccIds.has(p.accountId))
    .reduce((s, p) => s + num(p.amount), 0);
  const debtCollectionsCash = daySalePays
    .filter((p) => p.isDebtCollection && cashAccIds.has(p.accountId))
    .reduce((s, p) => s + num(p.amount), 0);
  const debtCollectionsDigital = daySalePays
    .filter((p) => p.isDebtCollection && !cashAccIds.has(p.accountId))
    .reduce((s, p) => s + num(p.amount), 0);

  const otherCashIncome = allInc
    .filter((i) => i.incomeDate === businessDate && cashAccIds.has(i.accountId))
    .reduce((s, i) => s + num(i.amount), 0);

  const operatingExpensesCash = allExp
    .filter((e) => e.expenseDate === businessDate && cashAccIds.has(e.accountId))
    .reduce((s, e) => s + num(e.amount), 0);

  const supplierPaymentsCash = allPurPays
    .filter((p) => p.paymentDate === businessDate && cashAccIds.has(p.accountId))
    .reduce((s, p) => s + num(p.amount), 0);

  // Other cash in/out (transfers or refunds on cash drawer)
  const dayCashTx = allTx.filter((t) => t.transactionDate === businessDate && cashAccIds.has(t.accountId));
  const otherCashTransfersIn = dayCashTx
    .filter((t) => t.direction === 'in' && (t.referenceType === 'transfer_in' || t.referenceType === 'purchase_refund'))
    .reduce((s, t) => s + num(t.amount), 0);
  const otherCashOut = dayCashTx
    .filter((t) => t.direction === 'out' && (t.referenceType === 'transfer_out' || t.referenceType === 'sale_refund'))
    .reduce((s, t) => s + num(t.amount), 0);

  const totalCashIn = cashSales + debtCollectionsCash + otherCashIncome + otherCashTransfersIn;
  const totalCashOut = operatingExpensesCash + supplierPaymentsCash + otherCashOut;
  const expectedClosingCash = openingCash + totalCashIn - totalCashOut;

  // Separate reconciliations per financial account
  const accountReconciliations = accs.map((acc) => {
    const dayIn = allTx
      .filter((t) => t.accountId === acc.id && t.transactionDate === businessDate && t.direction === 'in')
      .reduce((s, t) => s + num(t.amount), 0);
    const dayOut = allTx
      .filter((t) => t.accountId === acc.id && t.transactionDate === businessDate && t.direction === 'out')
      .reduce((s, t) => s + num(t.amount), 0);
    return {
      accountId: acc.id,
      accountName: acc.name,
      accountType: acc.accountType,
      dayIn,
      dayOut,
      currentBalance: num(acc.currentBalance),
    };
  });

  return {
    businessDate,
    existingClosing: existingClosings[0] || null,
    openingCash,
    cashSales,
    digitalSales,
    debtCollectionsCash,
    debtCollectionsDigital,
    otherCashIncome,
    totalCashIn,
    operatingExpensesCash,
    supplierPaymentsCash,
    otherCashOut,
    expectedClosingCash,
    accountReconciliations,
  };
}

crmFinanceRouter.get('/daily-closings', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(dailyClosings)
      .orderBy(desc(dailyClosings.businessDate))
      .limit(90);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load daily closing history.' });
  }
});

crmFinanceRouter.get('/daily-closings/preview', async (req, res) => {
  try {
    const businessDate = String(req.query.date || getYangonToday());
    const preview = await computeDailyClosingPreview(businessDate);
    res.json(preview);
  } catch (error) {
    console.error('Daily closing preview failed:', error);
    res.status(500).json({ error: 'Failed to calculate daily closing preview.' });
  }
});

crmFinanceRouter.post('/daily-closings', async (req: AuthRequest, res) => {
  try {
    const businessDate = String(req.body.businessDate || getYangonToday());
    const actualCashCount = num(req.body.actualCashCount);
    const notes = String(req.body.notes || '');

    const preview = await computeDailyClosingPreview(businessDate);
    const cashDifference = actualCashCount - preview.expectedClosingCash;

    const saved = await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(dailyClosings)
        .where(eq(dailyClosings.businessDate, businessDate))
        .limit(1);

      if (existing.length > 0 && existing[0].status === 'closed') {
        throw new Error(`Business date ${businessDate} is already closed.`);
      }

      const payload = {
        businessDate,
        openingCash: toMoney(preview.openingCash),
        cashSales: toMoney(preview.cashSales),
        digitalSales: toMoney(preview.digitalSales),
        debtCollectionsCash: toMoney(preview.debtCollectionsCash),
        debtCollectionsDigital: toMoney(preview.debtCollectionsDigital),
        otherCashIncome: toMoney(preview.otherCashIncome),
        totalCashIn: toMoney(preview.totalCashIn),
        operatingExpensesCash: toMoney(preview.operatingExpensesCash),
        supplierPaymentsCash: toMoney(preview.supplierPaymentsCash),
        otherCashOut: toMoney(preview.otherCashOut),
        expectedClosingCash: toMoney(preview.expectedClosingCash),
        actualCashCount: toMoney(actualCashCount),
        cashDifference: toMoney(cashDifference),
        accountReconciliations: JSON.stringify(preview.accountReconciliations),
        status: 'closed',
        notes,
        closedBy: req.appUser?.id,
        closedByName: req.appUser?.fullName || req.appUser?.email || 'Owner',
        closedAt: new Date(),
      };

      const [row] =
        existing.length > 0
          ? await tx
              .update(dailyClosings)
              .set(payload)
              .where(eq(dailyClosings.id, existing[0].id))
              .returning()
          : await tx.insert(dailyClosings).values(payload).returning();

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'CLOSE_DAILY_ACCOUNTS',
        module: 'daily_closing',
        recordId: row.id,
        newValue: { businessDate, expectedClosingCash: preview.expectedClosingCash, actualCashCount, cashDifference },
        reason: notes || 'End-of-day cash closing',
      });

      return row;
    });

    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to close business day.' });
  }
});

crmFinanceRouter.post('/daily-closings/:id/reopen', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 4) {
      return res.status(400).json({ error: 'A detailed authorization reason is mandatory to reopen a closed day.' });
    }
    if (req.appUser?.role !== 'owner' && req.appUser?.role !== 'accountant') {
      return res.status(403).json({ error: 'Only Owner or Accountant roles may reopen closed business days.' });
    }

    const [updated] = await db
      .update(dailyClosings)
      .set({ status: 'reopened', reopenReason: reason })
      .where(eq(dailyClosings.id, id))
      .returning();

    await writeAuditLog(db, {
      userId: req.appUser?.id,
      userEmail: req.appUser?.email,
      action: 'REOPEN_DAILY_CLOSING',
      module: 'daily_closing',
      recordId: id,
      previousValue: { status: 'closed' },
      newValue: { status: 'reopened', businessDate: updated.businessDate },
      reason,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to reopen daily closing.' });
  }
});

// ==================== MONTHLY CLOSING & P&L ====================

async function computePnL(startDate: string, endDate: string) {
  const [allSales, allReturns, allExp, allInc, allCusts, allSups, allProds, allAccs] = await Promise.all([
    db.select().from(sales),
    db.select().from(saleReturns),
    db.select().from(expenses),
    db.select().from(incomeRecords),
    db.select().from(customers).where(eq(customers.isActive, true)),
    db.select().from(suppliers).where(eq(suppliers.isActive, true)),
    db.select().from(products).where(eq(products.isActive, true)),
    db.select().from(financialAccounts).where(eq(financialAccounts.isActive, true)),
  ]);

  const validSales = allSales.filter(
    (s) => s.status !== 'draft' && s.status !== 'cancelled' && s.saleDate >= startDate && s.saleDate <= endDate
  );
  const periodReturns = allReturns.filter((r) => r.returnDate >= startDate && r.returnDate <= endDate);
  const periodExp = allExp.filter((e) => e.expenseDate >= startDate && e.expenseDate <= endDate);
  const periodInc = allInc.filter((i) => i.incomeDate >= startDate && i.incomeDate <= endDate);

  const salesRevenue = validSales.reduce((s, x) => s + num(x.grandTotal) - num(x.taxAmount), 0);
  const salesReturnsTotal = periodReturns.reduce((s, r) => s + num(r.refundAmount), 0);
  const netSales = salesRevenue - salesReturnsTotal;
  const cogs = validSales.reduce((s, x) => s + num(x.totalCogs), 0);
  const grossProfit = netSales - cogs;

  const operatingExpenses = periodExp
    .filter((e) => e.category !== 'Other Expenses')
    .reduce((s, e) => s + num(e.amount), 0);
  const otherExpenses = periodExp
    .filter((e) => e.category === 'Other Expenses')
    .reduce((s, e) => s + num(e.amount), 0);
  const otherIncome = periodInc.reduce((s, i) => s + num(i.amount), 0);
  const netProfit = grossProfit + otherIncome - operatingExpenses - otherExpenses;

  const totalReceivables = allCusts.reduce((s, c) => s + num(c.receivableBalance), 0);
  const totalPayables = allSups.reduce((s, sup) => s + num(sup.payableBalance), 0);
  const closingInventoryValue = allProds.reduce(
    (s, p) => s + num(p.currentStock) * num(p.weightedAvgCost),
    0
  );
  const cashBalance = allAccs
    .filter((a) => a.accountType === 'cash')
    .reduce((s, a) => s + num(a.currentBalance), 0);
  const bankBalances = allAccs
    .filter((a) => a.accountType !== 'cash')
    .reduce((s, a) => s + num(a.currentBalance), 0);

  // Expense breakdown by category
  const expByCat = new Map<string, number>();
  for (const e of periodExp) {
    expByCat.set(e.category, (expByCat.get(e.category) || 0) + num(e.amount));
  }

  return {
    startDate,
    endDate,
    salesRevenue,
    salesReturnsTotal,
    netSales,
    cogs,
    grossProfit,
    operatingExpenses,
    otherIncome,
    otherExpenses,
    netProfit,
    totalReceivables,
    totalPayables,
    closingInventoryValue,
    cashBalance,
    bankBalances,
    expenseBreakdown: Array.from(expByCat.entries()).map(([category, amount]) => ({ category, amount })),
  };
}

crmFinanceRouter.get('/monthly-closings', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(monthlyClosings)
      .orderBy(desc(monthlyClosings.periodMonth));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load monthly closings.' });
  }
});

crmFinanceRouter.get('/monthly-closings/report', async (req, res) => {
  try {
    const month = String(req.query.month || getYangonMonth());
    const startDate = String(req.query.startDate || `${month}-01`);
    const endDate = String(req.query.endDate || `${month}-31`);

    const current = await computePnL(startDate, endDate);

    // Previous month comparison
    const [y, m] = month.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, (m || 1) - 2, 1));
    const prevMonth = prevDate.toISOString().slice(0, 7);
    const previous = await computePnL(`${prevMonth}-01`, `${prevMonth}-31`);

    const existing = await db
      .select()
      .from(monthlyClosings)
      .where(eq(monthlyClosings.periodMonth, month))
      .limit(1);

    res.json({
      periodMonth: month,
      previousMonth: prevMonth,
      current,
      previous,
      finalizedRecord: existing[0] || null,
    });
  } catch (error) {
    console.error('Monthly P&L failed:', error);
    res.status(500).json({ error: 'Failed to generate Profit & Loss report.' });
  }
});

crmFinanceRouter.post('/monthly-closings/finalize', async (req: AuthRequest, res) => {
  try {
    const periodMonth = String(req.body.periodMonth || getYangonMonth());
    const notes = String(req.body.notes || '');
    const pnl = await computePnL(`${periodMonth}-01`, `${periodMonth}-31`);

    const [saved] = await db
      .insert(monthlyClosings)
      .values({
        periodMonth,
        salesRevenue: toMoney(pnl.salesRevenue),
        salesReturnsTotal: toMoney(pnl.salesReturnsTotal),
        netSales: toMoney(pnl.netSales),
        cogs: toMoney(pnl.cogs),
        grossProfit: toMoney(pnl.grossProfit),
        operatingExpenses: toMoney(pnl.operatingExpenses),
        otherIncome: toMoney(pnl.otherIncome),
        otherExpenses: toMoney(pnl.otherExpenses),
        netProfit: toMoney(pnl.netProfit),
        totalReceivables: toMoney(pnl.totalReceivables),
        totalPayables: toMoney(pnl.totalPayables),
        closingInventoryValue: toMoney(pnl.closingInventoryValue),
        cashBalance: toMoney(pnl.cashBalance),
        bankBalances: toMoney(pnl.bankBalances),
        status: 'finalized',
        notes,
        finalizedBy: req.appUser?.id,
        finalizedByName: req.appUser?.fullName || req.appUser?.email || 'Owner',
      })
      .onConflictDoUpdate({
        target: monthlyClosings.periodMonth,
        set: {
          salesRevenue: toMoney(pnl.salesRevenue),
          salesReturnsTotal: toMoney(pnl.salesReturnsTotal),
          netSales: toMoney(pnl.netSales),
          cogs: toMoney(pnl.cogs),
          grossProfit: toMoney(pnl.grossProfit),
          operatingExpenses: toMoney(pnl.operatingExpenses),
          otherIncome: toMoney(pnl.otherIncome),
          otherExpenses: toMoney(pnl.otherExpenses),
          netProfit: toMoney(pnl.netProfit),
          totalReceivables: toMoney(pnl.totalReceivables),
          totalPayables: toMoney(pnl.totalPayables),
          closingInventoryValue: toMoney(pnl.closingInventoryValue),
          cashBalance: toMoney(pnl.cashBalance),
          bankBalances: toMoney(pnl.bankBalances),
          status: 'finalized',
          notes,
          finalizedBy: req.appUser?.id,
          finalizedByName: req.appUser?.fullName || req.appUser?.email || 'Owner',
          finalizedAt: new Date(),
        },
      })
      .returning();

    await writeAuditLog(db, {
      userId: req.appUser?.id,
      userEmail: req.appUser?.email,
      action: 'FINALIZE_MONTHLY_CLOSING',
      module: 'monthly_closing',
      recordId: saved.id,
      newValue: { periodMonth, netSales: pnl.netSales, netProfit: pnl.netProfit },
      reason: notes || `Finalized monthly closing for ${periodMonth}`,
    });

    res.status(201).json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to finalize monthly closing.' });
  }
});
