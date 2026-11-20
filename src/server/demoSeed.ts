import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  accountTransactions,
  accountTransfers,
  categories,
  customers,
  dailyClosings,
  employees,
  expenses,
  financialAccounts,
  incomeRecords,
  monthlyClosings,
  packageItems,
  products,
  purchaseItems,
  purchasePayments,
  purchaseReturns,
  purchases,
  quotationItems,
  quotations,
  saleItems,
  salePayments,
  saleReturns,
  sales,
  solarPackages,
  stockMovements,
  suppliers,
  warrantyClaims,
  warrantyRecords,
} from '../db/schema.ts';
import {
  addMonthsToDate,
  ensureSystemDefaults,
  getYangonToday,
  num,
  toMoney,
  writeAuditLog,
} from './helpers.ts';

function shiftDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export async function loadDemoData(userId: string, userEmail: string) {
  await ensureSystemDefaults();

  return await db.transaction(async (tx) => {
    const existingDemo = await tx
      .select()
      .from(products)
      .where(eq(products.isDemo, true))
      .limit(1);
    if (existingDemo.length > 0) {
      throw new Error('Demo data is already loaded. Remove demo data first if you wish to reload.');
    }

    const today = getYangonToday();
    const yesterday = shiftDays(today, -1);
    const threeDaysAgo = shiftDays(today, -3);
    const weekAgo = shiftDays(today, -7);
    const twoWeeksAgo = shiftDays(today, -14);

    const catRows = await tx.select().from(categories);
    const catByName = new Map(catRows.map((c) => [c.name, c.id]));

    const accRows = await tx.select().from(financialAccounts);
    const cashAcc = accRows.find((a) => a.accountType === 'cash') || accRows[0];
    const kbzPayAcc = accRows.find((a) => a.accountType === 'kbzpay') || accRows[0];
    const kbzBankAcc = accRows.find((a) => a.accountType === 'bank') || accRows[0];

    // Seed opening capital into accounts if currently zero (tracked cleanly as demo)
    const accBalances = new Map<string, number>();
    for (const acc of accRows) {
      accBalances.set(acc.id, num(acc.currentBalance));
    }

    const addAccountTx = async (
      accountId: string,
      date: string,
      direction: 'in' | 'out',
      amount: number,
      category: string,
      referenceType: string,
      referenceId: string | null,
      referenceNumber: string,
      description: string
    ) => {
      const current = accBalances.get(accountId) || 0;
      const next = direction === 'in' ? current + amount : current - amount;
      accBalances.set(accountId, next);
      await tx.insert(accountTransactions).values({
        accountId,
        transactionDate: date,
        direction,
        amount: toMoney(amount),
        balanceAfter: toMoney(next),
        category,
        referenceType,
        referenceId,
        referenceNumber,
        description,
        userId,
        isDemo: true,
      });
    };

    await addAccountTx(
      cashAcc.id,
      twoWeeksAgo,
      'in',
      15000000,
      'Opening Capital',
      'opening',
      null,
      'DEMO-OPEN-CASH',
      'Demo Opening Cash Float'
    );
    await addAccountTx(
      kbzPayAcc.id,
      twoWeeksAgo,
      'in',
      8500000,
      'Opening Capital',
      'opening',
      null,
      'DEMO-OPEN-KPAY',
      'Demo Opening KBZPay Balance'
    );
    await addAccountTx(
      kbzBankAcc.id,
      twoWeeksAgo,
      'in',
      45000000,
      'Opening Capital',
      'opening',
      null,
      'DEMO-OPEN-BANK',
      'Demo Opening KBZ Bank Balance'
    );

    // 1. Demo Suppliers
    const insertedSuppliers = await tx
      .insert(suppliers)
      .values([
        {
          code: 'SUP-DEMO-01',
          name: 'Yangon Solar Wholesale Co., Ltd.',
          contactPerson: 'U Kyaw Zin',
          phone: '09-421008811',
          email: 'orders@yangonsolar.mm',
          address: 'Thilawa Logistics Park, Yangon',
          payableBalance: '3200000.00',
          isDemo: true,
        },
        {
          code: 'SUP-DEMO-02',
          name: 'Mandalay Power Tech Distributors',
          contactPerson: 'Daw Thinzar',
          phone: '09-798223344',
          email: 'sales@mdypowertech.mm',
          address: '78th Street, Chanayethazan, Mandalay',
          payableBalance: '0.00',
          isDemo: true,
        },
      ])
      .returning();

    // 2. Demo Customers
    const insertedCustomers = await tx
      .insert(customers)
      .values([
        {
          code: 'CUS-DEMO-01',
          name: 'U Min Aung (Hlaing Residence)',
          phone: '09-51233445',
          township: 'Hlaing',
          address: 'Parani Condo, Hlaing Township, Yangon',
          customerType: 'retail',
          priceTier: 'retail',
          receivableBalance: '0.00',
          isDemo: true,
        },
        {
          code: 'CUS-DEMO-02',
          name: 'Golden Delta Solar Installers',
          phone: '09-450998877',
          township: 'North Dagon',
          address: 'Pinlon Road, North Dagon, Yangon',
          customerType: 'installer',
          priceTier: 'wholesale',
          defaultDiscountPct: '3.00',
          receivableBalance: '1850000.00',
          isDemo: true,
        },
        {
          code: 'CUS-DEMO-03',
          name: 'Shwe Taung Cold Storage',
          phone: '09-250112233',
          township: 'Hlaing Tharyar',
          address: 'Industrial Zone 3, Yangon',
          customerType: 'corporate',
          priceTier: 'wholesale',
          receivableBalance: '0.00',
          isDemo: true,
        },
      ])
      .returning();

    // 3. Demo Products (using our generated product images!)
    const demoProductsData = [
      {
        sku: 'SP-LONGI-550',
        barcode: '885001055001',
        name: 'LONGi Hi-MO 5 550W Monocrystalline Panel',
        burmeseName: 'LONGi 550W မိုနို ဆိုလာပြား',
        brand: 'LONGi',
        model: 'LR5-72HPH-550M',
        categoryId: catByName.get('Solar Panels'),
        specifications: '550W, Half-Cut Mono PERC, 49.8V Voc, 21.3% Efficiency',
        unit: 'PCS',
        purchasePrice: '310000.00',
        weightedAvgCost: '310000.00',
        sellingPrice: '385000.00',
        wholesalePrice: '355000.00',
        minStockLevel: 10,
        currentStock: '28.00',
        warrantyMonths: 120,
        trackSerial: true,
        imageUrl: '/src/assets/images/solar_panel_550w_1795183052844.jpg',
        isDemo: true,
      },
      {
        sku: 'INV-DEYE-5KW',
        barcode: '885002005001',
        name: 'Deye 5kW Hybrid Solar Inverter (48V)',
        burmeseName: 'Deye 5kW ဟိုက်ဘရစ် အင်ဗာတာ',
        brand: 'Deye',
        model: 'SUN-5K-SG03LP1-EU',
        categoryId: catByName.get('Solar Inverters'),
        specifications: '5000W Hybrid, Dual MPPT, IP65, 48V Battery Input, WiFi Logger',
        unit: 'PCS',
        purchasePrice: '2850000.00',
        weightedAvgCost: '2850000.00',
        sellingPrice: '3450000.00',
        wholesalePrice: '3200000.00',
        minStockLevel: 4,
        currentStock: '6.00',
        warrantyMonths: 60,
        trackSerial: true,
        imageUrl: '/src/assets/images/solar_inverter_5kw_1795183070418.jpg',
        isDemo: true,
      },
      {
        sku: 'BAT-LIFEPO4-48100',
        barcode: '885003048100',
        name: 'LVTOPSUN 48V 100Ah LiFePO4 Lithium Battery',
        burmeseName: '48V 100Ah လစ်သီယမ် ဆိုလာဘက်ထရီ',
        brand: 'LVTOPSUN',
        model: 'LVTS-512100-W',
        categoryId: catByName.get('Solar Batteries'),
        specifications: '5.12kWh, 6000+ Cycles, Built-in Smart BMS, CAN/RS485',
        unit: 'PCS',
        purchasePrice: '2450000.00',
        weightedAvgCost: '2450000.00',
        sellingPrice: '2950000.00',
        wholesalePrice: '2780000.00',
        minStockLevel: 5,
        currentStock: '3.00', // Low stock alert demo!
        warrantyMonths: 60,
        trackSerial: true,
        imageUrl: '/src/assets/images/lithium_battery_48v_1795183054189.jpg',
        isDemo: true,
      },
      {
        sku: 'CC-MPPT-60A',
        barcode: '885004006001',
        name: 'Voltaic 60A MPPT Solar Charge Controller',
        burmeseName: '60A MPPT အားသွင်းထိန်းချုပ်စက်',
        brand: 'Voltaic',
        model: 'VT-MPPT60-150V',
        categoryId: catByName.get('Charge Controllers'),
        specifications: '12V/24V/48V Auto, 150V Max PV Input, LCD Display',
        unit: 'PCS',
        purchasePrice: '260000.00',
        weightedAvgCost: '260000.00',
        sellingPrice: '340000.00',
        wholesalePrice: '310000.00',
        minStockLevel: 6,
        currentStock: '11.00',
        warrantyMonths: 24,
        trackSerial: true,
        imageUrl: '/src/assets/images/charge_controller_mppt_1795183051018.jpg',
        isDemo: true,
      },
      {
        sku: 'CAB-PV-6MM',
        barcode: '885005000601',
        name: 'TÜV Solar PV Cable 6mm² (Red/Black)',
        burmeseName: '6mm ဆိုလာ PV ဝါယာကြိုး',
        brand: 'Suntree',
        model: 'H1Z2Z2-K 6MM',
        categoryId: catByName.get('Solar Cables'),
        specifications: '1500V DC, UV Resistant, Tinned Copper',
        unit: 'Meter',
        purchasePrice: '4200.00',
        weightedAvgCost: '4200.00',
        sellingPrice: '6000.00',
        wholesalePrice: '5200.00',
        minStockLevel: 100,
        currentStock: '340.00',
        warrantyMonths: 12,
        trackSerial: false,
        imageUrl: '',
        isDemo: true,
      },
      {
        sku: 'MNT-ALU-8P',
        barcode: '885007000801',
        name: 'Aluminum Roof Mounting Rail Set (For 8 Panels)',
        burmeseName: 'ဆိုလာပြား ၈ ချပ်စာ အလူမီနီယံ ဘောင်အစုံ',
        brand: 'K2-Pro',
        model: 'ALU-RAIL-8SET',
        categoryId: catByName.get('Mounting Structures'),
        specifications: 'Anodized 6005-T5 Aluminum, Stainless L-Feet & Clamps',
        unit: 'Set',
        purchasePrice: '320000.00',
        weightedAvgCost: '320000.00',
        sellingPrice: '430000.00',
        wholesalePrice: '390000.00',
        minStockLevel: 4,
        currentStock: '2.00', // Low stock alert demo!
        warrantyMonths: 12,
        trackSerial: false,
        imageUrl: '',
        isDemo: true,
      },
      {
        sku: 'BRK-DC-SPD-BOX',
        barcode: '885008001001',
        name: '2-In 2-Out Solar DC Combiner & SPD Protection Box',
        burmeseName: 'DC ဘရိတ်ကာနှင့် မိုးကြိုးကာ ဘောက်စ်အစုံ',
        brand: 'Suntree',
        model: 'SHB-2IN2OUT-1000V',
        categoryId: catByName.get('Distribution Boxes'),
        specifications: '1000V DC MCB, Surge Arrester SPD, Fuse Holders, IP65 Box',
        unit: 'Set',
        purchasePrice: '195000.00',
        weightedAvgCost: '195000.00',
        sellingPrice: '275000.00',
        wholesalePrice: '245000.00',
        minStockLevel: 5,
        currentStock: '9.00',
        warrantyMonths: 12,
        trackSerial: false,
        imageUrl: '',
        isDemo: true,
      },
    ];

    const insertedProducts = await tx.insert(products).values(demoProductsData).returning();
    const pPanel = insertedProducts[0];
    const pInverter = insertedProducts[1];
    const pBattery = insertedProducts[2];
    const pController = insertedProducts[3];
    const pCable = insertedProducts[4];
    const pMount = insertedProducts[5];
    const pBox = insertedProducts[6];

    // 4. Demo Purchase (Received + Partially Paid -> Supplier Payable = 3,200,000 MMK)
    const [demoPurchase] = await tx
      .insert(purchases)
      .values({
        purchaseNumber: 'PUR-DEMO-0001',
        supplierId: insertedSuppliers[0].id,
        purchaseDate: weekAgo,
        subtotal: '34200000.00',
        discountAmount: '0.00',
        additionalCharges: '0.00',
        totalAmount: '34200000.00',
        paidAmount: '31000000.00',
        outstandingAmount: '3200000.00',
        status: 'partially_paid',
        paymentMethod: 'Bank Transfer',
        notes: 'Initial bulk stock container for Yangon showroom (Demo)',
        userId,
        isDemo: true,
      })
      .returning();

    await tx.insert(purchaseItems).values([
      {
        purchaseId: demoPurchase.id,
        productId: pPanel.id,
        productName: pPanel.name,
        quantity: '40.00',
        unitCost: '310000.00',
        lineTotal: '12400000.00',
      },
      {
        purchaseId: demoPurchase.id,
        productId: pInverter.id,
        productName: pInverter.name,
        quantity: '8.00',
        unitCost: '2850000.00',
        lineTotal: '22800000.00',
      },
    ]);

    await tx.insert(purchasePayments).values({
      purchaseId: demoPurchase.id,
      supplierId: insertedSuppliers[0].id,
      accountId: kbzBankAcc.id,
      paymentDate: weekAgo,
      amount: '31000000.00',
      paymentMethod: 'Bank Transfer',
      referenceNote: 'KBZ Bank transfer #TX-88410',
      idempotencyKey: 'DEMO-PPAY-001',
      userId,
      isDemo: true,
    });

    await addAccountTx(
      kbzBankAcc.id,
      weekAgo,
      'out',
      31000000,
      'Supplier Purchase Payment',
      'purchase_payment',
      demoPurchase.id,
      demoPurchase.purchaseNumber,
      'Payment to Yangon Solar Wholesale Co., Ltd.'
    );

    // Record initial stock movements matching currentStock + sold qty
    for (const prod of insertedProducts) {
      await tx.insert(stockMovements).values({
        productId: prod.id,
        quantity: prod.currentStock,
        movementType: 'purchase_in',
        referenceType: 'purchase',
        referenceId: demoPurchase.id,
        referenceNumber: demoPurchase.purchaseNumber,
        previousQty: '0.00',
        newQty: prod.currentStock,
        unitCost: prod.weightedAvgCost,
        reason: 'Demo opening inventory stock-in',
        userId,
        isDemo: true,
      });
    }

    // 5. Demo Sales (3 realistic invoices across recent days & today)
    // Sale 1: Full 5kW Home System sold 3 days ago (Paid via KBZPay)
    const [sale1] = await tx
      .insert(sales)
      .values({
        invoiceNumber: 'INV-DEMO-0001',
        customerId: insertedCustomers[0].id,
        customerName: insertedCustomers[0].name,
        saleDate: threeDaysAgo,
        subtotal: '12835000.00',
        itemDiscountTotal: '0.00',
        overallDiscount: '135000.00',
        additionalCharges: '300000.00',
        taxAmount: '0.00',
        grandTotal: '13000000.00',
        paidAmount: '13000000.00',
        outstandingAmount: '0.00',
        totalCogs: '10445000.00',
        grossProfit: '2555000.00',
        status: 'fully_paid',
        paymentMethod: 'KBZPay',
        notes: 'Complete 5kW hybrid residential installation (Demo)',
        salespersonId: userId,
        isDemo: true,
      })
      .returning();

    await tx.insert(saleItems).values([
      {
        saleId: sale1.id,
        productId: pPanel.id,
        productName: pPanel.name,
        burmeseName: pPanel.burmeseName,
        quantity: '8.00',
        unitPrice: '385000.00',
        unitCostSnapshot: '310000.00',
        lineTotal: '3080000.00',
        warrantyMonths: 120,
        serialNumbers: 'LNG550-260101..08',
      },
      {
        saleId: sale1.id,
        productId: pInverter.id,
        productName: pInverter.name,
        burmeseName: pInverter.burmeseName,
        quantity: '1.00',
        unitPrice: '3450000.00',
        unitCostSnapshot: '2850000.00',
        lineTotal: '3450000.00',
        warrantyMonths: 60,
        serialNumbers: 'DEYE5K-2609912',
      },
      {
        saleId: sale1.id,
        productId: pBattery.id,
        productName: pBattery.name,
        burmeseName: pBattery.burmeseName,
        quantity: '2.00',
        unitPrice: '2950000.00',
        unitCostSnapshot: '2450000.00',
        lineTotal: '5900000.00',
        warrantyMonths: 60,
        serialNumbers: 'LVT48-260511, LVT48-260512',
      },
      {
        saleId: sale1.id,
        productId: pBox.id,
        productName: pBox.name,
        burmeseName: pBox.burmeseName,
        quantity: '1.00',
        unitPrice: '275000.00',
        unitCostSnapshot: '195000.00',
        lineTotal: '275000.00',
        warrantyMonths: 12,
      },
    ]);

    await tx.insert(salePayments).values({
      saleId: sale1.id,
      customerId: insertedCustomers[0].id,
      accountId: kbzPayAcc.id,
      paymentDate: threeDaysAgo,
      amount: '13000000.00',
      paymentMethod: 'KBZPay',
      isDebtCollection: false,
      referenceNote: 'KBZPay full payment',
      idempotencyKey: 'DEMO-SPAY-001',
      userId,
      isDemo: true,
    });
    await addAccountTx(
      kbzPayAcc.id,
      threeDaysAgo,
      'in',
      13000000,
      'Product Sales',
      'sale_payment',
      sale1.id,
      sale1.invoiceNumber,
      `POS Sale ${sale1.invoiceNumber} — ${sale1.customerName}`
    );

    // Sale 2: Installer Wholesale Credit Sale yesterday (Partially Paid, 1,850,000 MMK Receivable)
    const [sale2] = await tx
      .insert(sales)
      .values({
        invoiceNumber: 'INV-DEMO-0002',
        customerId: insertedCustomers[1].id,
        customerName: insertedCustomers[1].name,
        saleDate: yesterday,
        subtotal: '4850000.00',
        itemDiscountTotal: '0.00',
        overallDiscount: '0.00',
        additionalCharges: '0.00',
        taxAmount: '0.00',
        grandTotal: '4850000.00',
        paidAmount: '3000000.00',
        outstandingAmount: '1850000.00',
        totalCogs: '4090000.00',
        grossProfit: '760000.00',
        status: 'partially_paid',
        paymentMethod: 'Cash',
        notes: 'Wholesale installer credit order — balance due in 14 days (Demo)',
        salespersonId: userId,
        isDemo: true,
      })
      .returning();

    await tx.insert(saleItems).values([
      {
        saleId: sale2.id,
        productId: pPanel.id,
        productName: pPanel.name,
        burmeseName: pPanel.burmeseName,
        quantity: '4.00',
        unitPrice: '355000.00',
        unitCostSnapshot: '310000.00',
        lineTotal: '1420000.00',
        warrantyMonths: 120,
      },
      {
        saleId: sale2.id,
        productId: pInverter.id,
        productName: pInverter.name,
        burmeseName: pInverter.burmeseName,
        quantity: '1.00',
        unitPrice: '3200000.00',
        unitCostSnapshot: '2850000.00',
        lineTotal: '3200000.00',
        warrantyMonths: 60,
        serialNumbers: 'DEYE5K-2609918',
      },
    ]);

    await tx.insert(salePayments).values({
      saleId: sale2.id,
      customerId: insertedCustomers[1].id,
      accountId: cashAcc.id,
      paymentDate: yesterday,
      amount: '3000000.00',
      paymentMethod: 'Cash',
      isDebtCollection: false,
      referenceNote: 'Cash deposit',
      idempotencyKey: 'DEMO-SPAY-002',
      userId,
      isDemo: true,
    });
    await addAccountTx(
      cashAcc.id,
      yesterday,
      'in',
      3000000,
      'Product Sales',
      'sale_payment',
      sale2.id,
      sale2.invoiceNumber,
      `POS Sale ${sale2.invoiceNumber} — ${sale2.customerName}`
    );

    // Sale 3: Today's Cash Retail Sale
    const [sale3] = await tx
      .insert(sales)
      .values({
        invoiceNumber: 'INV-DEMO-0003',
        customerId: null,
        customerName: 'Walk-in Customer',
        saleDate: today,
        subtotal: '1255000.00',
        itemDiscountTotal: '0.00',
        overallDiscount: '15000.00',
        additionalCharges: '0.00',
        taxAmount: '0.00',
        grandTotal: '1240000.00',
        paidAmount: '1240000.00',
        outstandingAmount: '0.00',
        totalCogs: '927000.00',
        grossProfit: '313000.00',
        status: 'fully_paid',
        paymentMethod: 'Cash',
        notes: 'Counter walk-in sale (Demo)',
        salespersonId: userId,
        isDemo: true,
      })
      .returning();

    await tx.insert(saleItems).values([
      {
        saleId: sale3.id,
        productId: pController.id,
        productName: pController.name,
        burmeseName: pController.burmeseName,
        quantity: '2.00',
        unitPrice: '340000.00',
        unitCostSnapshot: '260000.00',
        lineTotal: '680000.00',
        warrantyMonths: 24,
        serialNumbers: 'VT60A-260401, VT60A-260402',
      },
      {
        saleId: sale3.id,
        productId: pCable.id,
        productName: pCable.name,
        burmeseName: pCable.burmeseName,
        quantity: '50.00',
        unitPrice: '6000.00',
        unitCostSnapshot: '4200.00',
        lineTotal: '300000.00',
        warrantyMonths: 12,
      },
      {
        saleId: sale3.id,
        productId: pBox.id,
        productName: pBox.name,
        burmeseName: pBox.burmeseName,
        quantity: '1.00',
        unitPrice: '275000.00',
        unitCostSnapshot: '195000.00',
        lineTotal: '275000.00',
        warrantyMonths: 12,
      },
    ]);

    await tx.insert(salePayments).values({
      saleId: sale3.id,
      customerId: null,
      accountId: cashAcc.id,
      paymentDate: today,
      amount: '1240000.00',
      paymentMethod: 'Cash',
      isDebtCollection: false,
      referenceNote: 'Cash counter payment',
      idempotencyKey: 'DEMO-SPAY-003',
      userId,
      isDemo: true,
    });
    await addAccountTx(
      cashAcc.id,
      today,
      'in',
      1240000,
      'Product Sales',
      'sale_payment',
      sale3.id,
      sale3.invoiceNumber,
      `POS Sale ${sale3.invoiceNumber} — Walk-in Customer`
    );

    // 6. Demo Expenses & Other Income
    const [exp1] = await tx
      .insert(expenses)
      .values({
        expenseNumber: 'EXP-DEMO-0001',
        category: 'Shop Rent',
        description: 'Monthly Yangon Showroom Rent',
        amount: '1200000.00',
        expenseDate: weekAgo,
        accountId: kbzBankAcc.id,
        paymentMethod: 'Bank Transfer',
        userId,
        isDemo: true,
      })
      .returning();
    await addAccountTx(
      kbzBankAcc.id,
      weekAgo,
      'out',
      1200000,
      'Shop Rent',
      'expense',
      exp1.id,
      exp1.expenseNumber,
      exp1.description
    );

    const [exp2] = await tx
      .insert(expenses)
      .values({
        expenseNumber: 'EXP-DEMO-0002',
        category: 'Delivery Charges',
        description: 'Light truck delivery for Hlaing 5kW installation',
        amount: '85000.00',
        expenseDate: today,
        accountId: cashAcc.id,
        paymentMethod: 'Cash',
        userId,
        isDemo: true,
      })
      .returning();
    await addAccountTx(
      cashAcc.id,
      today,
      'out',
      85000,
      'Delivery Charges',
      'expense',
      exp2.id,
      exp2.expenseNumber,
      exp2.description
    );

    const [inc1] = await tx
      .insert(incomeRecords)
      .values({
        incomeNumber: 'INC-DEMO-0001',
        category: 'Installation Revenue',
        description: 'Site commissioning & roof engineering service fee',
        amount: '450000.00',
        incomeDate: today,
        accountId: kbzPayAcc.id,
        paymentMethod: 'KBZPay',
        userId,
        isDemo: true,
      })
      .returning();
    await addAccountTx(
      kbzPayAcc.id,
      today,
      'in',
      450000,
      'Installation Revenue',
      'income',
      inc1.id,
      inc1.incomeNumber,
      inc1.description
    );

    // 7. Demo 5kW Solar System Package & Quotation
    const [pkg] = await tx
      .insert(solarPackages)
      .values({
        code: 'PKG-5KW-HYBRID',
        name: '5kW Hybrid Lithium Home Solar Package',
        burmeseName: '5kW အိမ်သုံး လစ်သီယမ် ဆိုလာပက်ကေ့ချ်',
        systemCapacityKw: '5.00',
        description: 'Powers 2 Aircons, Fridge, Lighting, WiFi, and Water Pump seamlessly 24/7.',
        installationCharge: '450000.00',
        transportCharge: '100000.00',
        discountAmount: '200000.00',
        totalCost: '10845000.00',
        sellingPrice: '13485000.00',
        estimatedProfit: '2640000.00',
        isDemo: true,
      })
      .returning();

    await tx.insert(packageItems).values([
      {
        packageId: pkg.id,
        productId: pPanel.id,
        productName: pPanel.name,
        quantity: '8.00',
        unitCost: '310000.00',
        unitPrice: '385000.00',
      },
      {
        packageId: pkg.id,
        productId: pInverter.id,
        productName: pInverter.name,
        quantity: '1.00',
        unitCost: '2850000.00',
        unitPrice: '3450000.00',
      },
      {
        packageId: pkg.id,
        productId: pBattery.id,
        productName: pBattery.name,
        quantity: '2.00',
        unitCost: '2450000.00',
        unitPrice: '2950000.00',
      },
      {
        packageId: pkg.id,
        productId: pMount.id,
        productName: pMount.name,
        quantity: '1.00',
        unitCost: '320000.00',
        unitPrice: '430000.00',
      },
      {
        packageId: pkg.id,
        productId: pBox.id,
        productName: pBox.name,
        quantity: '1.00',
        unitCost: '195000.00',
        unitPrice: '275000.00',
      },
    ]);

    const [qtn] = await tx
      .insert(quotations)
      .values({
        quotationNumber: 'QTN-DEMO-0001',
        customerId: insertedCustomers[2].id,
        customerName: insertedCustomers[2].name,
        packageId: pkg.id,
        quotationDate: today,
        validUntil: shiftDays(today, 14),
        subtotal: '13135000.00',
        installationCharge: '450000.00',
        transportCharge: '100000.00',
        discountAmount: '200000.00',
        totalCost: '10845000.00',
        grandTotal: '13485000.00',
        estimatedProfit: '2640000.00',
        status: 'approved',
        notes: 'Approved quotation ready to convert to confirmed POS sale (Demo)',
        userId,
        isDemo: true,
      })
      .returning();

    await tx.insert(quotationItems).values([
      {
        quotationId: qtn.id,
        productId: pPanel.id,
        productName: pPanel.name,
        quantity: '8.00',
        unitCost: '310000.00',
        unitPrice: '385000.00',
        lineTotal: '3080000.00',
      },
      {
        quotationId: qtn.id,
        productId: pInverter.id,
        productName: pInverter.name,
        quantity: '1.00',
        unitCost: '2850000.00',
        unitPrice: '3450000.00',
        lineTotal: '3450000.00',
      },
      {
        quotationId: qtn.id,
        productId: pBattery.id,
        productName: pBattery.name,
        quantity: '2.00',
        unitCost: '2450000.00',
        unitPrice: '2950000.00',
        lineTotal: '5900000.00',
      },
      {
        quotationId: qtn.id,
        productId: pMount.id,
        productName: pMount.name,
        quantity: '1.00',
        unitCost: '320000.00',
        unitPrice: '430000.00',
        lineTotal: '430000.00',
      },
      {
        quotationId: qtn.id,
        productId: pBox.id,
        productName: pBox.name,
        quantity: '1.00',
        unitCost: '195000.00',
        unitPrice: '275000.00',
        lineTotal: '275000.00',
      },
    ]);

    // 8. Demo Warranty Records (including one expiring soon for dashboard alert!)
    await tx.insert(warrantyRecords).values([
      {
        serialNumber: 'DEYE5K-2609912',
        productId: pInverter.id,
        productName: pInverter.name,
        customerId: insertedCustomers[0].id,
        customerName: insertedCustomers[0].name,
        customerPhone: insertedCustomers[0].phone,
        saleId: sale1.id,
        invoiceNumber: sale1.invoiceNumber,
        saleDate: threeDaysAgo,
        warrantyStartDate: threeDaysAgo,
        warrantyEndDate: addMonthsToDate(threeDaysAgo, 60),
        warrantyMonths: 60,
        status: 'active',
        isDemo: true,
      },
      {
        serialNumber: 'LVT48-260511',
        productId: pBattery.id,
        productName: pBattery.name,
        customerId: insertedCustomers[0].id,
        customerName: insertedCustomers[0].name,
        customerPhone: insertedCustomers[0].phone,
        saleId: sale1.id,
        invoiceNumber: sale1.invoiceNumber,
        saleDate: threeDaysAgo,
        warrantyStartDate: threeDaysAgo,
        warrantyEndDate: addMonthsToDate(threeDaysAgo, 60),
        warrantyMonths: 60,
        status: 'active',
        isDemo: true,
      },
      {
        serialNumber: 'VT60A-241120',
        productId: pController.id,
        productName: pController.name,
        customerId: insertedCustomers[1].id,
        customerName: insertedCustomers[1].name,
        customerPhone: insertedCustomers[1].phone,
        saleId: sale2.id,
        invoiceNumber: 'INV-202511-0094',
        saleDate: shiftDays(today, -350),
        warrantyStartDate: shiftDays(today, -350),
        warrantyEndDate: shiftDays(today, 15),
        warrantyMonths: 12,
        status: 'expiring_soon',
        notes: 'Warranty expiring in 15 days (Demo)',
        isDemo: true,
      },
    ]);

    // 9. Demo Employees
    await tx.insert(employees).values([
      {
        employeeCode: 'EMP-DEMO-01',
        fullName: 'Ko Aung Ko Latt',
        phone: '09-771234501',
        position: 'Lead Solar Engineer',
        monthlySalary: '950000.00',
        joiningDate: '2024-03-01',
        status: 'active',
        role: 'manager',
        isDemo: true,
      },
      {
        employeeCode: 'EMP-DEMO-02',
        fullName: 'Ma Su Myat Noe',
        phone: '09-771234502',
        position: 'Senior POS Cashier & Accounts',
        monthlySalary: '650000.00',
        joiningDate: '2024-06-15',
        status: 'active',
        role: 'accountant',
        isDemo: true,
      },
    ]);

    // Update account balances in DB
    for (const [accId, bal] of accBalances.entries()) {
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(bal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, accId));
    }

    await writeAuditLog(tx, {
      userId,
      userEmail,
      action: 'LOAD_DEMO_DATA',
      module: 'system',
      reason: 'Loaded clearly labeled Myanmar solar shop demo dataset',
    });

    return { loaded: true };
  });
}

export async function clearDemoData(userId: string, userEmail: string) {
  return await db.transaction(async (tx) => {
    // Delete in strict FK-safe child-to-parent order ONLY where isDemo = true
    await tx.delete(warrantyClaims).where(eq(warrantyClaims.isDemo, true));
    await tx.delete(warrantyRecords).where(eq(warrantyRecords.isDemo, true));
    await tx.delete(quotations).where(eq(quotations.isDemo, true));
    await tx.delete(solarPackages).where(eq(solarPackages.isDemo, true));
    await tx.delete(saleReturns).where(eq(saleReturns.isDemo, true));
    await tx.delete(purchaseReturns).where(eq(purchaseReturns.isDemo, true));
    await tx.delete(salePayments).where(eq(salePayments.isDemo, true));
    await tx.delete(purchasePayments).where(eq(purchasePayments.isDemo, true));
    await tx.delete(sales).where(eq(sales.isDemo, true));
    await tx.delete(purchases).where(eq(purchases.isDemo, true));
    await tx.delete(expenses).where(eq(expenses.isDemo, true));
    await tx.delete(incomeRecords).where(eq(incomeRecords.isDemo, true));
    await tx.delete(accountTransfers).where(eq(accountTransfers.isDemo, true));
    await tx.delete(accountTransactions).where(eq(accountTransactions.isDemo, true));
    await tx.delete(stockMovements).where(eq(stockMovements.isDemo, true));
    await tx.delete(dailyClosings).where(eq(dailyClosings.isDemo, true));
    await tx.delete(monthlyClosings).where(eq(monthlyClosings.isDemo, true));
    await tx.delete(employees).where(eq(employees.isDemo, true));
    await tx.delete(products).where(eq(products.isDemo, true));
    await tx.delete(customers).where(eq(customers.isDemo, true));
    await tx.delete(suppliers).where(eq(suppliers.isDemo, true));

    // Recalculate all non-demo account balances strictly from openingBalance + remaining non-demo accountTransactions
    const allAccounts = await tx.select().from(financialAccounts);
    const remainingTx = await tx.select().from(accountTransactions);

    for (const acc of allAccounts) {
      let bal = num(acc.openingBalance);
      for (const t of remainingTx) {
        if (t.accountId === acc.id && t.referenceType !== 'opening') {
          bal += t.direction === 'in' ? num(t.amount) : -num(t.amount);
        }
      }
      await tx
        .update(financialAccounts)
        .set({ currentBalance: toMoney(bal), updatedAt: new Date() })
        .where(eq(financialAccounts.id, acc.id));
    }

    await writeAuditLog(tx, {
      userId,
      userEmail,
      action: 'CLEAR_DEMO_DATA',
      module: 'system',
      reason: 'Safely removed all demo records and recalculated real account balances',
    });

    return { cleared: true };
  });
}
