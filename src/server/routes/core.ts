import { Router } from 'express';
import { desc, eq, gte, lte, and, ne, or, ilike } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  accountTransactions,
  branches,
  businessSettings,
  categories,
  customers,
  expenses,
  financialAccounts,
  incomeRecords,
  products,
  purchases,
  quotations,
  saleItems,
  salePayments,
  saleReturns,
  sales,
  stockMovements,
  suppliers,
  users,
  warrantyRecords,
} from '../../db/schema.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import {
  ensureSystemDefaults,
  getYangonMonth,
  getYangonToday,
  num,
  toMoney,
  writeAuditLog,
} from '../helpers.ts';
import { clearDemoData, loadDemoData } from '../demoSeed.ts';

export const coreRouter = Router();

// Bootstrap: initial user, settings, accounts, categories, notifications, demo status
coreRouter.get('/bootstrap', async (req: AuthRequest, res) => {
  try {
    await ensureSystemDefaults();
    const [settings] = await db.select().from(businessSettings).limit(1);
    const allBranches = await db.select().from(branches).orderBy(branches.name);
    const allCategories = await db.select().from(categories).orderBy(categories.sortOrder);
    const allAccounts = await db.select().from(financialAccounts).orderBy(financialAccounts.name);
    const allProducts = await db.select().from(products).where(eq(products.isActive, true));
    const allCustomers = await db.select().from(customers).where(eq(customers.isActive, true));
    const allSuppliers = await db.select().from(suppliers).where(eq(suppliers.isActive, true));
    const allWarranties = await db.select().from(warrantyRecords);
    const allQuotations = await db.select().from(quotations);

    const today = getYangonToday();
    const in30DaysDate = new Date(today + 'T00:00:00Z');
    in30DaysDate.setUTCDate(in30DaysDate.getUTCDate() + 30);
    const in30Days = in30DaysDate.toISOString().slice(0, 10);

    const lowStock = allProducts.filter((p) => num(p.currentStock) <= p.minStockLevel);
    const customerDebts = allCustomers.filter((c) => num(c.receivableBalance) > 0);
    const supplierPayables = allSuppliers.filter((s) => num(s.payableBalance) > 0);
    const expiringWarranties = allWarranties.filter(
      (w) =>
        (w.status === 'active' || w.status === 'expiring_soon') &&
        w.warrantyEndDate >= today &&
        w.warrantyEndDate <= in30Days
    );
    const pendingQuotations = allQuotations.filter(
      (q) => q.status === 'draft' || q.status === 'sent' || q.status === 'approved'
    );
    const hasDemoData = allProducts.some((p) => p.isDemo) || allCustomers.some((c) => c.isDemo);

    res.json({
      user: req.appUser,
      settings,
      branches: allBranches,
      categories: allCategories,
      accounts: allAccounts,
      hasDemoData,
      notifications: {
        lowStockCount: lowStock.length,
        lowStockItems: lowStock.slice(0, 6).map((p) => ({
          id: p.id,
          name: p.name,
          burmeseName: p.burmeseName,
          currentStock: num(p.currentStock),
          minStockLevel: p.minStockLevel,
        })),
        debtCount: customerDebts.length,
        totalReceivables: customerDebts.reduce((s, c) => s + num(c.receivableBalance), 0),
        payableCount: supplierPayables.length,
        totalPayables: supplierPayables.reduce((s, sup) => s + num(sup.payableBalance), 0),
        expiringWarrantyCount: expiringWarranties.length,
        pendingQuotationCount: pendingQuotations.length,
      },
    });
  } catch (error) {
    console.error('Bootstrap failed:', error);
    res.status(500).json({ error: 'Failed to load workspace bootstrap data.' });
  }
});

// Dashboard Analytics (100% computed from PostgreSQL records)
coreRouter.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    await ensureSystemDefaults();
    const today = getYangonToday();
    const currentMonth = getYangonMonth();
    const startDate = String(req.query.startDate || `${currentMonth}-01`);
    const endDate = String(req.query.endDate || today);

    const [
      allSales,
      allSaleItems,
      allSalePayments,
      allSaleReturns,
      allPurchases,
      allExpenses,
      allIncome,
      allProducts,
      allAccounts,
      allCustomers,
      allWarranties,
    ] = await Promise.all([
      db.select().from(sales).orderBy(desc(sales.createdAt)),
      db.select().from(saleItems),
      db.select().from(salePayments),
      db.select().from(saleReturns),
      db.select().from(purchases).orderBy(desc(purchases.createdAt)),
      db.select().from(expenses).orderBy(desc(expenses.createdAt)),
      db.select().from(incomeRecords).orderBy(desc(incomeRecords.createdAt)),
      db.select().from(products).where(eq(products.isActive, true)),
      db.select().from(financialAccounts).where(eq(financialAccounts.isActive, true)),
      db.select().from(customers).where(eq(customers.isActive, true)),
      db.select().from(warrantyRecords),
    ]);

    const validSales = allSales.filter((s) => s.status !== 'draft' && s.status !== 'cancelled');
    const filteredSales = validSales.filter((s) => s.saleDate >= startDate && s.saleDate <= endDate);
    const todaySalesList = validSales.filter((s) => s.saleDate === today);

    const todaySalesTotal = todaySalesList.reduce((sum, s) => sum + num(s.grandTotal), 0);
    const todayGrossProfit = todaySalesList.reduce((sum, s) => sum + num(s.grossProfit), 0);
    const todayCollectedPayments = allSalePayments
      .filter((p) => p.paymentDate === today)
      .reduce((sum, p) => sum + num(p.amount), 0);
    const todayExpensesTotal = allExpenses
      .filter((e) => e.expenseDate === today)
      .reduce((sum, e) => sum + num(e.amount), 0);

    // Filtered / Monthly Revenue & Net Profit
    const rangeSalesRevenue = filteredSales.reduce((sum, s) => sum + num(s.grandTotal), 0);
    const rangeReturns = allSaleReturns
      .filter((r) => r.returnDate >= startDate && r.returnDate <= endDate)
      .reduce((sum, r) => sum + num(r.refundAmount), 0);
    const rangeCogs = filteredSales.reduce((sum, s) => sum + num(s.totalCogs), 0);
    const rangeGrossProfit = rangeSalesRevenue - rangeReturns - rangeCogs;
    const rangeOtherIncome = allIncome
      .filter((i) => i.incomeDate >= startDate && i.incomeDate <= endDate)
      .reduce((sum, i) => sum + num(i.amount), 0);
    const rangeExpenses = allExpenses
      .filter((e) => e.expenseDate >= startDate && e.expenseDate <= endDate)
      .reduce((sum, e) => sum + num(e.amount), 0);
    const rangeNetProfit = rangeGrossProfit + rangeOtherIncome - rangeExpenses;

    // Inventory totals
    const totalInventoryQty = allProducts.reduce((sum, p) => sum + num(p.currentStock), 0);
    const totalInventoryValue = allProducts.reduce(
      (sum, p) => sum + num(p.currentStock) * num(p.weightedAvgCost),
      0
    );

    // Cash vs Bank/Digital Balances
    const cashBalance = allAccounts
      .filter((a) => a.accountType === 'cash')
      .reduce((sum, a) => sum + num(a.currentBalance), 0);
    const bankBalance = allAccounts
      .filter((a) => a.accountType !== 'cash')
      .reduce((sum, a) => sum + num(a.currentBalance), 0);

    // Chart 1: Daily Sales Trend (within range)
    const dailyMap = new Map<string, { date: string; sales: number; profit: number }>();
    for (const s of filteredSales) {
      const entry = dailyMap.get(s.saleDate) || { date: s.saleDate, sales: 0, profit: 0 };
      entry.sales += num(s.grandTotal);
      entry.profit += num(s.grossProfit);
      dailyMap.set(s.saleDate, entry);
    }
    const dailySalesTrend = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Chart 2 & 3: Monthly Revenue & Net Profit Trend (last 6 months with data)
    const monthlyMap = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
    for (const s of validSales) {
      const m = s.saleDate.slice(0, 7);
      const entry = monthlyMap.get(m) || { month: m, revenue: 0, expenses: 0, profit: 0 };
      entry.revenue += num(s.grandTotal);
      entry.profit += num(s.grossProfit);
      monthlyMap.set(m, entry);
    }
    for (const i of allIncome) {
      const m = i.incomeDate.slice(0, 7);
      const entry = monthlyMap.get(m) || { month: m, revenue: 0, expenses: 0, profit: 0 };
      entry.profit += num(i.amount);
      monthlyMap.set(m, entry);
    }
    for (const e of allExpenses) {
      const m = e.expenseDate.slice(0, 7);
      const entry = monthlyMap.get(m) || { month: m, revenue: 0, expenses: 0, profit: 0 };
      entry.expenses += num(e.amount);
      entry.profit -= num(e.amount);
      monthlyMap.set(m, entry);
    }
    const monthlyTrend = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);

    // Chart 4: Expense Breakdown
    const expCatMap = new Map<string, number>();
    for (const e of allExpenses.filter((ex) => ex.expenseDate >= startDate && ex.expenseDate <= endDate)) {
      expCatMap.set(e.category, (expCatMap.get(e.category) || 0) + num(e.amount));
    }
    const expenseBreakdown = Array.from(expCatMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Chart 5: Best-Selling Products
    const filteredSaleIds = new Set(filteredSales.map((s) => s.id));
    const prodSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const item of allSaleItems) {
      if (!filteredSaleIds.has(item.saleId)) continue;
      const netQty = num(item.quantity) - num(item.returnedQuantity);
      if (netQty <= 0) continue;
      const entry = prodSalesMap.get(item.productId) || {
        name: item.productName,
        quantity: 0,
        revenue: 0,
      };
      entry.quantity += netQty;
      entry.revenue += num(item.lineTotal);
      prodSalesMap.set(item.productId, entry);
    }
    const bestSellingProducts = Array.from(prodSalesMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    // Chart 6: Sales by Payment Method
    const payMethodMap = new Map<string, number>();
    for (const s of filteredSales) {
      payMethodMap.set(s.paymentMethod, (payMethodMap.get(s.paymentMethod) || 0) + num(s.grandTotal));
    }
    const salesByPaymentMethod = Array.from(payMethodMap.entries()).map(([method, amount]) => ({
      method,
      amount,
    }));

    // Widgets
    const lowStockProducts = allProducts
      .filter((p) => num(p.currentStock) <= p.minStockLevel)
      .sort((a, b) => num(a.currentStock) - num(b.currentStock))
      .slice(0, 8);

    const outstandingDebts = allCustomers
      .filter((c) => num(c.receivableBalance) > 0)
      .sort((a, b) => num(b.receivableBalance) - num(a.receivableBalance))
      .slice(0, 8);

    const in45DaysDate = new Date(today + 'T00:00:00Z');
    in45DaysDate.setUTCDate(in45DaysDate.getUTCDate() + 45);
    const in45Days = in45DaysDate.toISOString().slice(0, 10);
    const upcomingWarranties = allWarranties
      .filter((w) => w.warrantyEndDate >= today && w.warrantyEndDate <= in45Days)
      .sort((a, b) => a.warrantyEndDate.localeCompare(b.warrantyEndDate))
      .slice(0, 8);

    res.json({
      dateRange: { startDate, endDate, today },
      kpis: {
        todaySales: todaySalesTotal,
        todayCollectedPayments,
        todayExpenses: todayExpensesTotal,
        todayGrossProfit,
        monthlyRevenue: rangeSalesRevenue,
        monthlyNetProfit: rangeNetProfit,
        totalInventoryQty,
        totalInventoryValue,
        cashBalance,
        bankBalance,
      },
      charts: {
        dailySalesTrend,
        monthlyTrend,
        expenseBreakdown,
        bestSellingProducts,
        salesByPaymentMethod,
      },
      widgets: {
        recentSales: validSales.slice(0, 6),
        recentPurchases: allPurchases.slice(0, 6),
        lowStockProducts,
        recentExpenses: allExpenses.slice(0, 6),
        outstandingDebts,
        upcomingWarranties,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to compute dashboard metrics.' });
  }
});

// Global Search
coreRouter.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ products: [], customers: [], suppliers: [], sales: [], warranties: [] });
    }
    const pattern = `%${q}%`;
    const [prods, custs, sups, sls, wars] = await Promise.all([
      db
        .select()
        .from(products)
        .where(
          or(
            ilike(products.name, pattern),
            ilike(products.burmeseName, pattern),
            ilike(products.sku, pattern),
            ilike(products.barcode, pattern),
            ilike(products.brand, pattern)
          )
        )
        .limit(6),
      db
        .select()
        .from(customers)
        .where(or(ilike(customers.name, pattern), ilike(customers.phone, pattern), ilike(customers.code, pattern)))
        .limit(6),
      db
        .select()
        .from(suppliers)
        .where(or(ilike(suppliers.name, pattern), ilike(suppliers.phone, pattern)))
        .limit(5),
      db
        .select()
        .from(sales)
        .where(or(ilike(sales.invoiceNumber, pattern), ilike(sales.customerName, pattern)))
        .limit(6),
      db
        .select()
        .from(warrantyRecords)
        .where(
          or(
            ilike(warrantyRecords.serialNumber, pattern),
            ilike(warrantyRecords.invoiceNumber, pattern),
            ilike(warrantyRecords.customerPhone, pattern)
          )
        )
        .limit(6),
    ]);

    res.json({ products: prods, customers: custs, suppliers: sups, sales: sls, warranties: wars });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Global search failed.' });
  }
});

// Onboarding Wizard Completion
coreRouter.post('/onboarding/complete', async (req: AuthRequest, res) => {
  try {
    const {
      shopName,
      burmeseName,
      address,
      phone,
      email,
      currency,
      defaultLanguage,
      openingCashBalance,
      openingBankBalance,
      initialSupplier,
      initialProduct,
      loadDemo,
    } = req.body;

    await ensureSystemDefaults();

    await db.transaction(async (tx) => {
      const [settings] = await tx.select().from(businessSettings).limit(1);
      if (settings) {
        await tx
          .update(businessSettings)
          .set({
            shopName: shopName || settings.shopName,
            burmeseName: burmeseName || settings.burmeseName,
            address: address || settings.address,
            phone: phone || settings.phone,
            email: email || settings.email,
            currency: currency || 'MMK',
            defaultLanguage: defaultLanguage || 'my',
            updatedAt: new Date(),
          })
          .where(eq(businessSettings.id, settings.id));
      }

      const today = getYangonToday();
      const accs = await tx.select().from(financialAccounts);
      const cashAcc = accs.find((a) => a.accountType === 'cash');
      const bankAcc = accs.find((a) => a.accountType === 'bank');

      if (cashAcc && num(openingCashBalance) > 0 && num(cashAcc.openingBalance) === 0) {
        const amt = num(openingCashBalance);
        await tx
          .update(financialAccounts)
          .set({
            openingBalance: toMoney(amt),
            currentBalance: toMoney(num(cashAcc.currentBalance) + amt),
          })
          .where(eq(financialAccounts.id, cashAcc.id));
        await tx.insert(accountTransactions).values({
          accountId: cashAcc.id,
          transactionDate: today,
          direction: 'in',
          amount: toMoney(amt),
          balanceAfter: toMoney(num(cashAcc.currentBalance) + amt),
          category: 'Opening Balance',
          referenceType: 'opening',
          referenceNumber: 'OPEN-CASH',
          description: 'Initial Shop Opening Cash Balance',
          userId: req.appUser?.id,
        });
      }

      if (bankAcc && num(openingBankBalance) > 0 && num(bankAcc.openingBalance) === 0) {
        const amt = num(openingBankBalance);
        await tx
          .update(financialAccounts)
          .set({
            openingBalance: toMoney(amt),
            currentBalance: toMoney(num(bankAcc.currentBalance) + amt),
          })
          .where(eq(financialAccounts.id, bankAcc.id));
        await tx.insert(accountTransactions).values({
          accountId: bankAcc.id,
          transactionDate: today,
          direction: 'in',
          amount: toMoney(amt),
          balanceAfter: toMoney(num(bankAcc.currentBalance) + amt),
          category: 'Opening Balance',
          referenceType: 'opening',
          referenceNumber: 'OPEN-BANK',
          description: 'Initial Shop Opening Bank Balance',
          userId: req.appUser?.id,
        });
      }

      if (initialSupplier?.name) {
        await tx
          .insert(suppliers)
          .values({
            code: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
            name: initialSupplier.name,
            contactPerson: initialSupplier.contactPerson || '',
            phone: initialSupplier.phone || '',
            address: initialSupplier.address || '',
          })
          .onConflictDoNothing();
      }

      if (initialProduct?.name && initialProduct?.sku) {
        const [firstCat] = await tx.select().from(categories).limit(1);
        const openingQty = num(initialProduct.openingStock);
        const cost = num(initialProduct.purchasePrice);
        const [createdProd] = await tx
          .insert(products)
          .values({
            sku: initialProduct.sku,
            name: initialProduct.name,
            burmeseName: initialProduct.burmeseName || initialProduct.name,
            brand: initialProduct.brand || '',
            categoryId: initialProduct.categoryId || firstCat?.id || null,
            unit: initialProduct.unit || 'PCS',
            purchasePrice: toMoney(cost),
            weightedAvgCost: toMoney(cost),
            sellingPrice: toMoney(num(initialProduct.sellingPrice)),
            wholesalePrice: toMoney(num(initialProduct.wholesalePrice || initialProduct.sellingPrice)),
            currentStock: toMoney(openingQty),
            minStockLevel: Number(initialProduct.minStockLevel || 5),
          })
          .returning();

        if (openingQty > 0 && createdProd) {
          await tx.insert(stockMovements).values({
            productId: createdProd.id,
            quantity: toMoney(openingQty),
            movementType: 'opening',
            referenceType: 'opening',
            referenceNumber: 'OPEN-STOCK',
            previousQty: '0.00',
            newQty: toMoney(openingQty),
            unitCost: toMoney(cost),
            reason: 'Initial opening stock from Setup Wizard',
            userId: req.appUser?.id,
          });
        }
      }

      if (req.appUser?.id) {
        await tx
          .update(users)
          .set({ onboardingCompleted: true, updatedAt: new Date() })
          .where(eq(users.id, req.appUser.id));
      }

      await writeAuditLog(tx, {
        userId: req.appUser?.id,
        userEmail: req.appUser?.email,
        action: 'COMPLETE_ONBOARDING',
        module: 'settings',
        newValue: { shopName, currency },
        reason: 'Completed initial shop setup wizard',
      });
    });

    if (loadDemo && req.appUser) {
      await loadDemoData(req.appUser.id, req.appUser.email);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Onboarding failed:', error);
    res.status(400).json({ error: error.message || 'Failed to complete onboarding setup.' });
  }
});

// Demo Data Controls
coreRouter.post('/demo/load', async (req: AuthRequest, res) => {
  try {
    if (!req.appUser) return res.status(401).json({ error: 'Unauthorized' });
    const result = await loadDemoData(req.appUser.id, req.appUser.email);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to load demo data.' });
  }
});

coreRouter.post('/demo/clear', async (req: AuthRequest, res) => {
  try {
    if (!req.appUser) return res.status(401).json({ error: 'Unauthorized' });
    const result = await clearDemoData(req.appUser.id, req.appUser.email);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to remove demo data.' });
  }
});

// Settings & Branches
coreRouter.get('/settings', async (_req, res) => {
  try {
    await ensureSystemDefaults();
    const [settings] = await db.select().from(businessSettings).limit(1);
    const allBranches = await db.select().from(branches).orderBy(branches.createdAt);
    res.json({ settings, branches: allBranches });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

coreRouter.put('/settings', async (req: AuthRequest, res) => {
  try {
    const [existing] = await db.select().from(businessSettings).limit(1);
    if (!existing) return res.status(404).json({ error: 'Settings record missing.' });

    const body = req.body;
    const [updated] = await db
      .update(businessSettings)
      .set({
        shopName: body.shopName ?? existing.shopName,
        burmeseName: body.burmeseName ?? existing.burmeseName,
        logoUrl: body.logoUrl ?? existing.logoUrl,
        address: body.address ?? existing.address,
        phone: body.phone ?? existing.phone,
        email: body.email ?? existing.email,
        currency: body.currency ?? existing.currency,
        timezone: body.timezone ?? existing.timezone,
        defaultLanguage: body.defaultLanguage ?? existing.defaultLanguage,
        invoicePrefix: body.invoicePrefix ?? existing.invoicePrefix,
        purchasePrefix: body.purchasePrefix ?? existing.purchasePrefix,
        quotationPrefix: body.quotationPrefix ?? existing.quotationPrefix,
        receiptFooter: body.receiptFooter ?? existing.receiptFooter,
        taxEnabled: body.taxEnabled ?? existing.taxEnabled,
        taxRate: body.taxRate !== undefined ? toMoney(num(body.taxRate)) : existing.taxRate,
        defaultDiscountPct:
          body.defaultDiscountPct !== undefined
            ? toMoney(num(body.defaultDiscountPct))
            : existing.defaultDiscountPct,
        lowStockThreshold:
          body.lowStockThreshold !== undefined
            ? Number(body.lowStockThreshold)
            : existing.lowStockThreshold,
        allowNegativeStock: body.allowNegativeStock ?? existing.allowNegativeStock,
        defaultWarrantyMonths:
          body.defaultWarrantyMonths !== undefined
            ? Number(body.defaultWarrantyMonths)
            : existing.defaultWarrantyMonths,
        enableInstallations: body.enableInstallations ?? existing.enableInstallations,
        enableMultiBranch: body.enableMultiBranch ?? existing.enableMultiBranch,
        updatedAt: new Date(),
      })
      .where(eq(businessSettings.id, existing.id))
      .returning();

    await writeAuditLog(db, {
      userId: req.appUser?.id,
      userEmail: req.appUser?.email,
      action: 'UPDATE_SETTINGS',
      module: 'settings',
      recordId: updated.id,
      previousValue: {
        allowNegativeStock: existing.allowNegativeStock,
        taxEnabled: existing.taxEnabled,
        taxRate: existing.taxRate,
      },
      newValue: {
        allowNegativeStock: updated.allowNegativeStock,
        taxEnabled: updated.taxEnabled,
        taxRate: updated.taxRate,
      },
      reason: 'Updated business & system configuration',
    });

    res.json(updated);
  } catch (error) {
    console.error('Update settings failed:', error);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

coreRouter.post('/branches', async (req: AuthRequest, res) => {
  try {
    const { name, code, address, phone } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Branch name and code are required.' });
    const [created] = await db
      .insert(branches)
      .values({ name, code: code.toUpperCase(), address: address || '', phone: phone || '' })
      .returning();
    res.status(201).json(created);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to add branch.' });
  }
});
