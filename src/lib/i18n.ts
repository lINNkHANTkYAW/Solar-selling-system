export type Language = 'my' | 'en';

const DICT: Record<string, { my: string; en: string }> = {
  // Navigation
  nav_dashboard: { my: 'ဒက်ရှ်ဘုတ်', en: 'Dashboard' },
  nav_pos: { my: 'အရောင်းနှင့် POS', en: 'Sales & POS' },
  nav_inventory: { my: 'ပစ္စည်းစာရင်း', en: 'Inventory' },
  nav_purchases: { my: 'အဝယ်စာရင်း', en: 'Purchases' },
  nav_customers: { my: 'ဖောက်သည်များ', en: 'Customers' },
  nav_suppliers: { my: 'ကုန်ပေးသွင်းသူများ', en: 'Suppliers' },
  nav_finance: { my: 'ငွေကြေးနှင့် စာရင်းပိတ်', en: 'Finance & Closing' },
  nav_quotations: { my: 'ပက်ကေ့ချ်နှင့် ဈေးနှုန်းလွှာ', en: 'Packages & Quotes' },
  nav_warranty: { my: 'အာမခံနှင့် စီရီရယ်', en: 'Warranty' },
  nav_reports: { my: 'အစီရင်ခံစာများ', en: 'Reports' },
  nav_employees: { my: 'ဝန်ထမ်းနှင့် စစ်ဆေးမှတ်တမ်း', en: 'Employees & Audit' },
  nav_settings: { my: 'ဆက်တင်များ', en: 'Settings' },

  // Common Actions
  search_placeholder: { my: 'ပစ္စည်း၊ ဘောက်ချာ၊ ဖောက်သည်၊ စီရီရယ် ရှာဖွေရန်...', en: 'Search products, invoices, customers, serials...' },
  add_new: { my: 'အသစ်ထည့်ရန်', en: 'Add New' },
  save: { my: 'သိမ်းဆည်းရန်', en: 'Save' },
  cancel: { my: 'ပယ်ဖျက်ရန်', en: 'Cancel' },
  confirm: { my: 'အတည်ပြုရန်', en: 'Confirm' },
  edit: { my: 'ပြင်ဆင်ရန်', en: 'Edit' },
  delete: { my: 'ဖျက်ရန်', en: 'Delete' },
  archive: { my: 'သိမ်းဆည်းပိတ်ရန်', en: 'Archive' },
  view_details: { my: 'အသေးစိတ်ကြည့်ရန်', en: 'View Details' },
  export_csv: { my: 'CSV ထုတ်ရန်', en: 'Export CSV' },
  print: { my: 'ပရင့်ထုတ်ရန်', en: 'Print' },
  loading: { my: 'ဒေတာများ ရယူနေပါသည်...', en: 'Loading data...' },
  no_data: { my: 'မှတ်တမ်းမရှိသေးပါ', en: 'No records found' },
  sign_out: { my: 'ထွက်ရန်', en: 'Sign Out' },
  demo_mode_badge: { my: 'နမူနာဒေတာ ဖွင့်ထားသည်', en: 'Demo Data Active' },
  remove_demo: { my: 'နမူနာဒေတာ ဖယ်ရှားရန်', en: 'Remove Demo Data' },
  load_demo: { my: 'နမူနာဒေတာ ထည့်သွင်းရန်', en: 'Load Demo Data' },

  // Dashboard KPIs
  kpi_today_sales: { my: 'ယနေ့ အရောင်းစုစုပေါင်း', en: "Today's Sales" },
  kpi_today_collected: { my: 'ယနေ့ ငွေလက်ခံရရှိမှု', en: "Today's Collected" },
  kpi_today_expenses: { my: 'ယနေ့ အသုံးစရိတ်', en: "Today's Expenses" },
  kpi_today_gross_profit: { my: 'ယနေ့ အကြမ်းအမြတ်', en: "Today's Gross Profit" },
  kpi_monthly_revenue: { my: 'ကာလအတွင်း ရောင်းအား', en: 'Period Revenue' },
  kpi_monthly_net_profit: { my: 'ကာလအတွင်း အသားတင်အမြတ်', en: 'Period Net Profit' },
  kpi_inv_qty: { my: 'စုစုပေါင်း လက်ကျန်ပစ္စည်း', en: 'Total Inventory Qty' },
  kpi_inv_value: { my: 'လက်ကျန်ပစ္စည်း တန်ဖိုး', en: 'Inventory Valuation' },
  kpi_cash_balance: { my: 'လက်ငင်းငွေသား လက်ကျန်', en: 'Cash Balance' },
  kpi_bank_balance: { my: 'ဘဏ်နှင့် ဒစ်ဂျစ်တယ် လက်ကျန်', en: 'Bank & Digital Balance' },

  // Quick Actions
  qa_new_sale: { my: 'အရောင်းအသစ်', en: 'New Sale' },
  qa_add_product: { my: 'ပစ္စည်းအသစ်', en: 'Add Product' },
  qa_stock_in: { my: 'စတော့ထည့်သွင်း', en: 'Stock Adjust' },
  qa_new_purchase: { my: 'အဝယ်အသစ်', en: 'New Purchase' },
  qa_add_expense: { my: 'စရိတ်ထည့်ရန်', en: 'Add Expense' },
  qa_new_quote: { my: 'ဈေးနှုန်းလွှာ', en: 'New Quotation' },

  // Date filters
  filter_today: { my: 'ယနေ့', en: 'Today' },
  filter_yesterday: { my: 'မနေ့က', en: 'Yesterday' },
  filter_week: { my: 'ယခုအပတ်', en: 'This Week' },
  filter_month: { my: 'ယခုလ', en: 'This Month' },
  filter_last_month: { my: 'ပြီးခဲ့သောလ', en: 'Last Month' },
  filter_custom: { my: 'ရက်စွဲရွေးရန်', en: 'Custom Range' },

  // POS
  pos_terminal: { my: 'POS အရောင်းကောင်တာ', en: 'POS Checkout' },
  sales_history: { my: 'အရောင်းမှတ်တမ်း', en: 'Sales History' },
  cart_empty: { my: 'စျေးဝယ်ခြင်းထဲတွင် ပစ္စည်းမရှိသေးပါ', en: 'Cart is empty. Click products to add.' },
  subtotal: { my: 'စုစုပေါင်းတန်ဖိုး', en: 'Subtotal' },
  discount: { my: 'လျှော့ဈေး', en: 'Discount' },
  additional_charges: { my: 'အပိုဝန်ဆောင်ခ', en: 'Additional Charges' },
  grand_total: { my: 'ကျသင့်ငွေ စုစုပေါင်း', en: 'Grand Total' },
  paid_amount: { my: 'ပေးချေငွေ', en: 'Paid Amount' },
  remaining_balance: { my: 'ကျန်ငွေ (အကြွေး)', en: 'Remaining Balance' },
  confirm_sale: { my: 'အရောင်းအတည်ပြုရန်', en: 'Confirm & Complete Sale' },

  // Status Labels
  status_in_stock: { my: 'လက်ကျန်ရှိ', en: 'In Stock' },
  status_low_stock: { my: 'လက်ကျန်နည်း', en: 'Low Stock' },
  status_out_of_stock: { my: 'လက်ကျန်ကုန်', en: 'Out of Stock' },
  status_fully_paid: { my: 'ငွေရှင်းပြီး', en: 'Fully Paid' },
  status_partially_paid: { my: 'တစ်စိတ်တစ်ပိုင်းရှင်းပြီး', en: 'Partially Paid' },
  status_completed: { my: 'အကြွေး/ပြီးစီး', en: 'Credit / Completed' },
  status_draft: { my: 'မူကြမ်း', en: 'Draft' },
  status_received: { my: 'ပစ္စည်းလက်ခံပြီး', en: 'Received' },
  status_cancelled: { my: 'ပယ်ဖျက်ပြီး', en: 'Cancelled' },
  status_returned: { my: 'ပြန်အပ်ပြီး', en: 'Returned' },
  status_partially_returned: { my: 'တစ်စိတ်တစ်ပိုင်းပြန်အပ်', en: 'Partially Returned' },
  status_active: { my: 'အကျုံးဝင်နေဆဲ', en: 'Active' },
  status_expiring_soon: { my: 'သက်တမ်းကုန်ခါနီး', en: 'Expiring Soon' },
  status_expired: { my: 'သက်တမ်းကုန်ဆုံး', en: 'Expired' },
  status_under_claim: { my: 'အာမခံစစ်ဆေးနေဆဲ', en: 'Under Claim' },
  status_replaced: { my: 'အစားထိုးပြီး', en: 'Replaced' },
};

export function translate(key: string, lang: Language): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] || entry.en;
}

export function formatMMK(value: number | string | null | undefined, currency = 'MMK'): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return `0 ${currency}`;
  return `${Math.round(num).toLocaleString('en-US')} ${currency}`;
}

export function formatDateDDMMYYYY(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return String(dateStr);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Yangon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
  return parts;
}

export function getYangonTodayClient(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
