import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// 1. Branches (Single shop default, multi-branch ready)
export const branches = pgTable('branches', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  address: text('address').default(''),
  phone: text('phone').default(''),
  isDefault: boolean('is_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Users (Linked to Firebase Auth UID)
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').default('').notNull(),
  role: text('role').default('owner').notNull(), // owner | manager | cashier | accountant | staff
  phone: text('phone').default(''),
  branchId: uuid('branch_id').references(() => branches.id),
  isActive: boolean('is_active').default(true).notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Business Settings
export const businessSettings = pgTable('business_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  shopName: text('shop_name').default('ShweSolar Energy & Equipment').notNull(),
  burmeseName: text('burmese_name').default('ရွှေဆိုလာ စွမ်းအင်နှင့် ပစ္စည်းအရောင်းဆိုင်').notNull(),
  logoUrl: text('logo_url').default(''),
  address: text('address').default('No. 42, Pyay Road, Hlaing Township, Yangon').notNull(),
  phone: text('phone').default('09-795-412-880').notNull(),
  email: text('email').default('sales@shwesolar.mm').notNull(),
  currency: text('currency').default('MMK').notNull(),
  timezone: text('timezone').default('Asia/Yangon').notNull(),
  defaultLanguage: text('default_language').default('my').notNull(), // my | en
  invoicePrefix: text('invoice_prefix').default('INV').notNull(),
  purchasePrefix: text('purchase_prefix').default('PUR').notNull(),
  quotationPrefix: text('quotation_prefix').default('QTN').notNull(),
  receiptFooter: text('receipt_footer')
    .default('ဝယ်ယူအားပေးမှုအတွက် ကျေးဇူးတင်ပါသည်။ Thank you for powering your future with ShweSolar.')
    .notNull(),
  taxEnabled: boolean('tax_enabled').default(false).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).default('0.00').notNull(),
  defaultDiscountPct: numeric('default_discount_pct', { precision: 5, scale: 2 }).default('0.00').notNull(),
  lowStockThreshold: integer('low_stock_threshold').default(5).notNull(),
  allowNegativeStock: boolean('allow_negative_stock').default(false).notNull(),
  defaultWarrantyMonths: integer('default_warranty_months').default(12).notNull(),
  enableInstallations: boolean('enable_installations').default(true).notNull(),
  enableMultiBranch: boolean('enable_multi_branch').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Categories
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  burmeseName: text('burmese_name').default('').notNull(),
  description: text('description').default(''),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 5. Products
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sku: text('sku').notNull().unique(),
    barcode: text('barcode').default(''),
    name: text('name').notNull(),
    burmeseName: text('burmese_name').default('').notNull(),
    brand: text('brand').default('').notNull(),
    model: text('model').default('').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    description: text('description').default(''),
    specifications: text('specifications').default(''),
    unit: text('unit').default('PCS').notNull(), // PCS | Set | Meter | Roll | Box | Pair | kW | W
    purchasePrice: numeric('purchase_price', { precision: 14, scale: 2 }).default('0.00').notNull(),
    weightedAvgCost: numeric('weighted_avg_cost', { precision: 14, scale: 2 }).default('0.00').notNull(),
    sellingPrice: numeric('selling_price', { precision: 14, scale: 2 }).default('0.00').notNull(),
    wholesalePrice: numeric('wholesale_price', { precision: 14, scale: 2 }).default('0.00').notNull(),
    minStockLevel: integer('min_stock_level').default(5).notNull(),
    currentStock: numeric('current_stock', { precision: 14, scale: 2 }).default('0.00').notNull(),
    warrantyMonths: integer('warranty_months').default(12).notNull(),
    trackSerial: boolean('track_serial').default(false).notNull(),
    imageUrl: text('image_url').default(''),
    isActive: boolean('is_active').default(true).notNull(),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_products_category').on(table.categoryId),
    index('idx_products_sku').on(table.sku),
  ]
);

// 6. Stock Movements (Immutable Audit Trail for Inventory)
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    branchId: uuid('branch_id').references(() => branches.id),
    quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(), // signed delta (+ for in, - for out)
    movementType: text('movement_type').notNull(), // opening | purchase_in | sale_out | sale_return_in | purchase_return_out | adjustment_in | adjustment_out | damaged
    referenceType: text('reference_type').default('manual').notNull(), // opening | purchase | sale | sale_return | purchase_return | adjustment
    referenceId: uuid('reference_id'),
    referenceNumber: text('reference_number').default('').notNull(),
    previousQty: numeric('previous_qty', { precision: 14, scale: 2 }).notNull(),
    newQty: numeric('new_qty', { precision: 14, scale: 2 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).default('0.00').notNull(),
    reason: text('reason').default('').notNull(),
    userId: uuid('user_id').references(() => users.id),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_stock_movements_product').on(table.productId),
    index('idx_stock_movements_created').on(table.createdAt),
  ]
);

// 7. Suppliers
export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  contactPerson: text('contact_person').default('').notNull(),
  phone: text('phone').default('').notNull(),
  email: text('email').default(''),
  address: text('address').default(''),
  notes: text('notes').default(''),
  payableBalance: numeric('payable_balance', { precision: 14, scale: 2 }).default('0.00').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 8. Customers
export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  phone: text('phone').default('').notNull(),
  secondaryPhone: text('secondary_phone').default(''),
  address: text('address').default(''),
  township: text('township').default(''),
  customerType: text('customer_type').default('retail').notNull(), // retail | wholesale | installer | corporate
  priceTier: text('price_tier').default('retail').notNull(), // retail | wholesale
  defaultDiscountPct: numeric('default_discount_pct', { precision: 5, scale: 2 }).default('0.00').notNull(),
  notes: text('notes').default(''),
  receivableBalance: numeric('receivable_balance', { precision: 14, scale: 2 }).default('0.00').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 9. Financial Accounts (Cash, KBZPay, WavePay, Banks)
export const financialAccounts = pgTable('financial_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  accountType: text('account_type').notNull(), // cash | kbzpay | wavepay | bank | other
  bankName: text('bank_name').default(''),
  accountNumber: text('account_number').default(''),
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).default('0.00').notNull(),
  currentBalance: numeric('current_balance', { precision: 14, scale: 2 }).default('0.00').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 10. Account Transactions (Ledger)
export const accountTransactions = pgTable(
  'account_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .references(() => financialAccounts.id)
      .notNull(),
    transactionDate: text('transaction_date').notNull(), // YYYY-MM-DD (Asia/Yangon)
    direction: text('direction').notNull(), // in | out
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
    category: text('category').default('').notNull(),
    referenceType: text('reference_type').notNull(), // opening | sale_payment | debt_collection | purchase_payment | supplier_payment | expense | income | transfer_in | transfer_out | sale_refund | purchase_refund
    referenceId: uuid('reference_id'),
    referenceNumber: text('reference_number').default('').notNull(),
    description: text('description').default('').notNull(),
    userId: uuid('user_id').references(() => users.id),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_account_tx_account').on(table.accountId),
    index('idx_account_tx_date').on(table.transactionDate),
  ]
);

// 11. Account Transfers (Internal movement — never revenue or expense)
export const accountTransfers = pgTable('account_transfers', {
  id: uuid('id').defaultRandom().primaryKey(),
  transferNumber: text('transfer_number').notNull().unique(),
  fromAccountId: uuid('from_account_id')
    .references(() => financialAccounts.id)
    .notNull(),
  toAccountId: uuid('to_account_id')
    .references(() => financialAccounts.id)
    .notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  transferDate: text('transfer_date').notNull(), // YYYY-MM-DD
  notes: text('notes').default(''),
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 12. Purchases
export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseNumber: text('purchase_number').notNull().unique(),
    supplierId: uuid('supplier_id')
      .references(() => suppliers.id)
      .notNull(),
    branchId: uuid('branch_id').references(() => branches.id),
    purchaseDate: text('purchase_date').notNull(), // YYYY-MM-DD
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).default('0.00').notNull(),
    discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    additionalCharges: numeric('additional_charges', { precision: 14, scale: 2 }).default('0.00').notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    outstandingAmount: numeric('outstanding_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    status: text('status').default('draft').notNull(), // draft | received | partially_paid | fully_paid | cancelled
    paymentMethod: text('payment_method').default('Cash').notNull(),
    notes: text('notes').default(''),
    attachmentUrl: text('attachment_url').default(''),
    userId: uuid('user_id').references(() => users.id),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_purchases_supplier').on(table.supplierId),
    index('idx_purchases_date').on(table.purchaseDate),
  ]
);

// 13. Purchase Items
export const purchaseItems = pgTable('purchase_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseId: uuid('purchase_id')
    .references(() => purchases.id, { onDelete: 'cascade' })
    .notNull(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  productName: text('product_name').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  returnedQuantity: numeric('returned_quantity', { precision: 14, scale: 2 }).default('0.00').notNull(),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

// 14. Purchase Payments
export const purchasePayments = pgTable('purchase_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseId: uuid('purchase_id')
    .references(() => purchases.id)
    .notNull(),
  supplierId: uuid('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  accountId: uuid('account_id')
    .references(() => financialAccounts.id)
    .notNull(),
  paymentDate: text('payment_date').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(),
  referenceNote: text('reference_note').default(''),
  idempotencyKey: text('idempotency_key').unique(),
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 15. Sales
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    customerId: uuid('customer_id').references(() => customers.id),
    customerName: text('customer_name').default('Walk-in Customer').notNull(),
    branchId: uuid('branch_id').references(() => branches.id),
    saleDate: text('sale_date').notNull(), // YYYY-MM-DD
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).default('0.00').notNull(),
    itemDiscountTotal: numeric('item_discount_total', { precision: 14, scale: 2 }).default('0.00').notNull(),
    overallDiscount: numeric('overall_discount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    additionalCharges: numeric('additional_charges', { precision: 14, scale: 2 }).default('0.00').notNull(),
    taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    grandTotal: numeric('grand_total', { precision: 14, scale: 2 }).default('0.00').notNull(),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    outstandingAmount: numeric('outstanding_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
    totalCogs: numeric('total_cogs', { precision: 14, scale: 2 }).default('0.00').notNull(),
    grossProfit: numeric('gross_profit', { precision: 14, scale: 2 }).default('0.00').notNull(),
    status: text('status').default('completed').notNull(), // draft | completed | partially_paid | fully_paid | cancelled | returned | partially_returned
    paymentMethod: text('payment_method').default('Cash').notNull(), // Cash | KBZPay | WavePay | Bank Transfer | Credit | Other
    notes: text('notes').default(''),
    salespersonId: uuid('salesperson_id').references(() => users.id),
    quotationId: uuid('quotation_id'),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sales_customer').on(table.customerId),
    index('idx_sales_date').on(table.saleDate),
  ]
);

// 16. Sale Items (Preserves historical unitCostSnapshot!)
export const saleItems = pgTable('sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id')
    .references(() => sales.id, { onDelete: 'cascade' })
    .notNull(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  productName: text('product_name').notNull(),
  burmeseName: text('burmese_name').default('').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  returnedQuantity: numeric('returned_quantity', { precision: 14, scale: 2 }).default('0.00').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 14, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
  warrantyMonths: integer('warranty_months').default(0).notNull(),
  serialNumbers: text('serial_numbers').default(''),
});

// 17. Sale Payments (Distinguishes immediate POS payment vs Debt Collection)
export const salePayments = pgTable('sale_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id')
    .references(() => sales.id)
    .notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  accountId: uuid('account_id')
    .references(() => financialAccounts.id)
    .notNull(),
  paymentDate: text('payment_date').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text('payment_method').notNull(),
  isDebtCollection: boolean('is_debt_collection').default(false).notNull(),
  referenceNote: text('reference_note').default(''),
  idempotencyKey: text('idempotency_key').unique(),
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 18. Sale Returns
export const saleReturns = pgTable('sale_returns', {
  id: uuid('id').defaultRandom().primaryKey(),
  returnNumber: text('return_number').notNull().unique(),
  saleId: uuid('sale_id')
    .references(() => sales.id)
    .notNull(),
  saleItemId: uuid('sale_item_id')
    .references(() => saleItems.id)
    .notNull(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  refundAmount: numeric('refund_amount', { precision: 14, scale: 2 }).notNull(),
  refundAccountId: uuid('refund_account_id').references(() => financialAccounts.id),
  restockType: text('restock_type').default('restock').notNull(), // restock | damaged
  reason: text('reason').notNull(),
  returnDate: text('return_date').notNull(),
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 19. Purchase Returns
export const purchaseReturns = pgTable('purchase_returns', {
  id: uuid('id').defaultRandom().primaryKey(),
  returnNumber: text('return_number').notNull().unique(),
  purchaseId: uuid('purchase_id')
    .references(() => purchases.id)
    .notNull(),
  purchaseItemId: uuid('purchase_item_id')
    .references(() => purchaseItems.id)
    .notNull(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  adjustmentAmount: numeric('adjustment_amount', { precision: 14, scale: 2 }).notNull(),
  refundAccountId: uuid('refund_account_id').references(() => financialAccounts.id),
  settlementType: text('settlement_type').default('payable_adjustment').notNull(), // payable_adjustment | cash_refund
  reason: text('reason').notNull(),
  returnDate: text('return_date').notNull(),
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 20. Expenses
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    expenseNumber: text('expense_number').notNull().unique(),
    category: text('category').notNull(), // Employee Salary | Shop Rent | Electricity | Transportation | Delivery Charges | Maintenance | Internet | Office Supplies | Marketing | Other Expenses
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    expenseDate: text('expense_date').notNull(), // YYYY-MM-DD
    accountId: uuid('account_id')
      .references(() => financialAccounts.id)
      .notNull(),
    paymentMethod: text('payment_method').notNull(),
    receiptUrl: text('receipt_url').default(''),
    notes: text('notes').default(''),
    userId: uuid('user_id').references(() => users.id),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_expenses_date').on(table.expenseDate)]
);

// 21. Other Income Records (Non-Product Sales Income)
export const incomeRecords = pgTable(
  'income_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    incomeNumber: text('income_number').notNull().unique(),
    category: text('category').notNull(), // Installation Revenue | Repair Services | Transportation Charges | Other Income
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    incomeDate: text('income_date').notNull(),
    accountId: uuid('account_id')
      .references(() => financialAccounts.id)
      .notNull(),
    paymentMethod: text('payment_method').notNull(),
    notes: text('notes').default(''),
    userId: uuid('user_id').references(() => users.id),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_income_date').on(table.incomeDate)]
);

// 22. Solar Packages
export const solarPackages = pgTable('solar_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  burmeseName: text('burmese_name').default('').notNull(),
  systemCapacityKw: numeric('system_capacity_kw', { precision: 8, scale: 2 }).default('5.00').notNull(),
  description: text('description').default(''),
  installationCharge: numeric('installation_charge', { precision: 14, scale: 2 }).default('0.00').notNull(),
  transportCharge: numeric('transport_charge', { precision: 14, scale: 2 }).default('0.00').notNull(),
  discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  totalCost: numeric('total_cost', { precision: 14, scale: 2 }).default('0.00').notNull(),
  sellingPrice: numeric('selling_price', { precision: 14, scale: 2 }).default('0.00').notNull(),
  estimatedProfit: numeric('estimated_profit', { precision: 14, scale: 2 }).default('0.00').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 23. Package Items
export const packageItems = pgTable('package_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  packageId: uuid('package_id')
    .references(() => solarPackages.id, { onDelete: 'cascade' })
    .notNull(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  productName: text('product_name').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
});

// 24. Quotations (Never reduces inventory until converted to Sale!)
export const quotations = pgTable('quotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  quotationNumber: text('quotation_number').notNull().unique(),
  customerId: uuid('customer_id').references(() => customers.id),
  customerName: text('customer_name').notNull(),
  packageId: uuid('package_id').references(() => solarPackages.id),
  quotationDate: text('quotation_date').notNull(),
  validUntil: text('valid_until').notNull(),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).default('0.00').notNull(),
  installationCharge: numeric('installation_charge', { precision: 14, scale: 2 }).default('0.00').notNull(),
  transportCharge: numeric('transport_charge', { precision: 14, scale: 2 }).default('0.00').notNull(),
  discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).default('0.00').notNull(),
  totalCost: numeric('total_cost', { precision: 14, scale: 2 }).default('0.00').notNull(),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2 }).default('0.00').notNull(),
  estimatedProfit: numeric('estimated_profit', { precision: 14, scale: 2 }).default('0.00').notNull(),
  status: text('status').default('draft').notNull(), // draft | sent | approved | rejected | expired | converted
  convertedSaleId: uuid('converted_sale_id').references(() => sales.id),
  notes: text('notes').default(''),
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 25. Quotation Items
export const quotationItems = pgTable('quotation_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  quotationId: uuid('quotation_id')
    .references(() => quotations.id, { onDelete: 'cascade' })
    .notNull(),
  productId: uuid('product_id')
    .references(() => products.id)
    .notNull(),
  productName: text('product_name').notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

// 26. Warranty Records & Serial Numbers
export const warrantyRecords = pgTable(
  'warranty_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serialNumber: text('serial_number').notNull(),
    productId: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    productName: text('product_name').notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    customerName: text('customer_name').default('').notNull(),
    customerPhone: text('customer_phone').default('').notNull(),
    saleId: uuid('sale_id').references(() => sales.id),
    invoiceNumber: text('invoice_number').default('').notNull(),
    purchaseDate: text('purchase_date').default(''),
    saleDate: text('sale_date').notNull(),
    warrantyStartDate: text('warranty_start_date').notNull(),
    warrantyEndDate: text('warranty_end_date').notNull(),
    warrantyMonths: integer('warranty_months').default(12).notNull(),
    status: text('status').default('active').notNull(), // active | expiring_soon | expired | under_claim | replaced
    notes: text('notes').default(''),
    isDemo: boolean('is_demo').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_warranty_serial').on(table.serialNumber),
    index('idx_warranty_invoice').on(table.invoiceNumber),
    index('idx_warranty_phone').on(table.customerPhone),
  ]
);

// 27. Warranty Claims
export const warrantyClaims = pgTable('warranty_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  warrantyId: uuid('warranty_id')
    .references(() => warrantyRecords.id, { onDelete: 'cascade' })
    .notNull(),
  claimDate: text('claim_date').notNull(),
  issueDescription: text('issue_description').notNull(),
  resolutionNotes: text('resolution_notes').default(''),
  replacementSerial: text('replacement_serial').default(''),
  status: text('status').default('open').notNull(), // open | inspecting | approved | replaced | rejected | closed
  userId: uuid('user_id').references(() => users.id),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 28. Employees
export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  employeeCode: text('employee_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone').default('').notNull(),
  position: text('position').notNull(),
  monthlySalary: numeric('monthly_salary', { precision: 14, scale: 2 }).default('0.00').notNull(),
  joiningDate: text('joining_date').notNull(),
  status: text('status').default('active').notNull(), // active | on_leave | resigned
  userUid: text('user_uid').default(''),
  role: text('role').default('staff').notNull(),
  notes: text('notes').default(''),
  isDemo: boolean('is_demo').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 29. Daily Closings
export const dailyClosings = pgTable('daily_closings', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessDate: text('business_date').notNull().unique(), // YYYY-MM-DD
  branchId: uuid('branch_id').references(() => branches.id),
  openingCash: numeric('opening_cash', { precision: 14, scale: 2 }).default('0.00').notNull(),
  cashSales: numeric('cash_sales', { precision: 14, scale: 2 }).default('0.00').notNull(),
  digitalSales: numeric('digital_sales', { precision: 14, scale: 2 }).default('0.00').notNull(),
  debtCollectionsCash: numeric('debt_collections_cash', { precision: 14, scale: 2 }).default('0.00').notNull(),
  debtCollectionsDigital: numeric('debt_collections_digital', { precision: 14, scale: 2 }).default('0.00').notNull(),
  otherCashIncome: numeric('other_cash_income', { precision: 14, scale: 2 }).default('0.00').notNull(),
  totalCashIn: numeric('total_cash_in', { precision: 14, scale: 2 }).default('0.00').notNull(),
  operatingExpensesCash: numeric('operating_expenses_cash', { precision: 14, scale: 2 }).default('0.00').notNull(),
  supplierPaymentsCash: numeric('supplier_payments_cash', { precision: 14, scale: 2 }).default('0.00').notNull(),
  otherCashOut: numeric('other_cash_out', { precision: 14, scale: 2 }).default('0.00').notNull(),
  expectedClosingCash: numeric('expected_closing_cash', { precision: 14, scale: 2 }).default('0.00').notNull(),
  actualCashCount: numeric('actual_cash_count', { precision: 14, scale: 2 }).default('0.00').notNull(),
  cashDifference: numeric('cash_difference', { precision: 14, scale: 2 }).default('0.00').notNull(),
  accountReconciliations: text('account_reconciliations').default('[]').notNull(), // JSON array of per-account reconciliation
  status: text('status').default('closed').notNull(), // closed | reopened
  notes: text('notes').default(''),
  reopenReason: text('reopen_reason').default(''),
  closedBy: uuid('closed_by').references(() => users.id),
  closedByName: text('closed_by_name').default('').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }).defaultNow().notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
});

// 30. Monthly Closings (P&L Reconciliation)
export const monthlyClosings = pgTable('monthly_closings', {
  id: uuid('id').defaultRandom().primaryKey(),
  periodMonth: text('period_month').notNull().unique(), // YYYY-MM
  branchId: uuid('branch_id').references(() => branches.id),
  salesRevenue: numeric('sales_revenue', { precision: 14, scale: 2 }).default('0.00').notNull(),
  salesReturnsTotal: numeric('sales_returns_total', { precision: 14, scale: 2 }).default('0.00').notNull(),
  netSales: numeric('net_sales', { precision: 14, scale: 2 }).default('0.00').notNull(),
  cogs: numeric('cogs', { precision: 14, scale: 2 }).default('0.00').notNull(),
  grossProfit: numeric('gross_profit', { precision: 14, scale: 2 }).default('0.00').notNull(),
  operatingExpenses: numeric('operating_expenses', { precision: 14, scale: 2 }).default('0.00').notNull(),
  otherIncome: numeric('other_income', { precision: 14, scale: 2 }).default('0.00').notNull(),
  otherExpenses: numeric('other_expenses', { precision: 14, scale: 2 }).default('0.00').notNull(),
  netProfit: numeric('net_profit', { precision: 14, scale: 2 }).default('0.00').notNull(),
  totalReceivables: numeric('total_receivables', { precision: 14, scale: 2 }).default('0.00').notNull(),
  totalPayables: numeric('total_payables', { precision: 14, scale: 2 }).default('0.00').notNull(),
  closingInventoryValue: numeric('closing_inventory_value', { precision: 14, scale: 2 }).default('0.00').notNull(),
  cashBalance: numeric('cash_balance', { precision: 14, scale: 2 }).default('0.00').notNull(),
  bankBalances: numeric('bank_balances', { precision: 14, scale: 2 }).default('0.00').notNull(),
  status: text('status').default('finalized').notNull(), // finalized | reopened
  notes: text('notes').default(''),
  finalizedBy: uuid('finalized_by').references(() => users.id),
  finalizedByName: text('finalized_by_name').default('').notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }).defaultNow().notNull(),
  isDemo: boolean('is_demo').default(false).notNull(),
});

// 31. Audit Logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id),
    userEmail: text('user_email').default('').notNull(),
    action: text('action').notNull(),
    module: text('module').notNull(),
    recordId: text('record_id').default('').notNull(),
    previousValue: text('previous_value').default(''),
    newValue: text('new_value').default(''),
    reason: text('reason').default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_module').on(table.module),
    index('idx_audit_created').on(table.createdAt),
  ]
);
