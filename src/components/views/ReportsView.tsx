import React, { useCallback, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest, downloadCSV } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK, getYangonTodayClient } from '../../lib/i18n';
import { DataTable, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

type ReportType =
  | 'sales'
  | 'product_sales'
  | 'customer_sales'
  | 'inventory_valuation'
  | 'expenses'
  | 'cash_flow'
  | 'receivables'
  | 'payables'
  | 'purchases';

export const ReportsView: React.FC = () => {
  const { t, lang, bootstrap, notify } = useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [reportType, setReportType] = useState<ReportType>('sales');
  const [startDate, setStartDate] = useState(() => `${getYangonTodayClient().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(() => getYangonTodayClient());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/reports?startDate=${startDate}&endDate=${endDate}`);
      setData(res);
    } catch (error: any) {
      notify('error', error.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, notify]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const reportConfigs: Record<
    ReportType,
    { label: string; rows: any[]; columns: ColumnDef<any>[]; csvHeaders: { key: string; label: string }[] }
  > = {
    sales: {
      label: 'Sales Report',
      rows: data?.salesReport || [],
      csvHeaders: [
        { key: 'invoiceNumber', label: 'Invoice #' },
        { key: 'saleDate', label: 'Date' },
        { key: 'customerName', label: 'Customer' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'grandTotal', label: 'Grand Total' },
        { key: 'totalCogs', label: 'COGS' },
        { key: 'grossProfit', label: 'Gross Profit' },
        { key: 'paidAmount', label: 'Paid' },
        { key: 'outstandingAmount', label: 'Balance' },
      ],
      columns: [
        { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono-num font-semibold">{r.invoiceNumber}</span> },
        { key: 'saleDate', header: 'Date', render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.saleDate)}</span> },
        { key: 'customerName', header: 'Customer', render: (r) => r.customerName },
        { key: 'grandTotal', header: 'Revenue', align: 'right', render: (r) => <span className="font-mono-num">{formatMMK(r.grandTotal, currency)}</span> },
        { key: 'totalCogs', header: 'COGS', align: 'right', render: (r) => <span className="font-mono-num text-slate-500">{formatMMK(r.totalCogs, '')}</span> },
        { key: 'grossProfit', header: 'Gross Profit', align: 'right', render: (r) => <span className="font-mono-num font-semibold text-emerald-700">{formatMMK(r.grossProfit, currency)}</span> },
        { key: 'status', header: 'Status', render: (r) => <StatusText status={r.status} /> },
      ],
    },
    product_sales: {
      label: 'Product Sales (Fast/Slow Moving)',
      rows: data?.productSalesReport || [],
      csvHeaders: [
        { key: 'productName', label: 'Product' },
        { key: 'qtySold', label: 'Quantity Sold' },
        { key: 'revenue', label: 'Revenue' },
        { key: 'cogs', label: 'COGS' },
        { key: 'profit', label: 'Gross Profit' },
      ],
      columns: [
        { key: 'productName', header: 'Product', render: (r) => <span className="font-medium">{r.productName}</span> },
        { key: 'qtySold', header: 'Qty Sold', align: 'right', sortable: true, sortValue: (r) => r.qtySold, render: (r) => <span className="font-mono-num font-bold">{r.qtySold}</span> },
        { key: 'revenue', header: 'Revenue', align: 'right', sortable: true, sortValue: (r) => r.revenue, render: (r) => <span className="font-mono-num">{formatMMK(r.revenue, currency)}</span> },
        { key: 'cogs', header: 'COGS', align: 'right', render: (r) => <span className="font-mono-num text-slate-500">{formatMMK(r.cogs, '')}</span> },
        { key: 'profit', header: 'Gross Profit', align: 'right', sortable: true, sortValue: (r) => r.profit, render: (r) => <span className="font-mono-num font-semibold text-emerald-700">{formatMMK(r.profit, currency)}</span> },
      ],
    },
    customer_sales: {
      label: 'Customer Sales Summary',
      rows: data?.customerSalesReport || [],
      csvHeaders: [
        { key: 'customerName', label: 'Customer' },
        { key: 'invoices', label: 'Invoices' },
        { key: 'totalSales', label: 'Total Sales' },
        { key: 'paid', label: 'Paid' },
        { key: 'outstanding', label: 'Outstanding' },
      ],
      columns: [
        { key: 'customerName', header: 'Customer', render: (r) => <span className="font-medium">{r.customerName}</span> },
        { key: 'invoices', header: 'Invoices', align: 'right', render: (r) => <span className="font-mono-num">{r.invoices}</span> },
        { key: 'totalSales', header: 'Total Sales', align: 'right', render: (r) => <span className="font-mono-num font-semibold">{formatMMK(r.totalSales, currency)}</span> },
        { key: 'paid', header: 'Collected', align: 'right', render: (r) => <span className="font-mono-num text-emerald-700">{formatMMK(r.paid, '')}</span> },
        { key: 'outstanding', header: 'Receivable', align: 'right', render: (r) => <span className="font-mono-num text-red-700">{formatMMK(r.outstanding, currency)}</span> },
      ],
    },
    inventory_valuation: {
      label: 'Inventory Valuation (WAC)',
      rows: data?.inventoryValuation || [],
      csvHeaders: [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Product' },
        { key: 'brand', label: 'Brand' },
        { key: 'currentStock', label: 'Current Stock' },
        { key: 'weightedAvgCost', label: 'Weighted Avg Cost' },
        { key: 'valuation', label: 'Stock Valuation' },
        { key: 'potentialRevenue', label: 'Retail Value' },
      ],
      columns: [
        { key: 'sku', header: 'SKU', render: (r) => <span className="font-mono-num text-xs">{r.sku}</span> },
        { key: 'name', header: 'Product', render: (r) => <span className="font-medium text-xs">{r.name}</span> },
        { key: 'currentStock', header: 'On Hand', align: 'right', render: (r) => <span className="font-mono-num font-bold">{r.currentStock} {r.unit}</span> },
        { key: 'weightedAvgCost', header: 'WAC', align: 'right', render: (r) => <span className="font-mono-num text-xs">{formatMMK(r.weightedAvgCost, '')}</span> },
        { key: 'valuation', header: 'Cost Valuation', align: 'right', sortable: true, sortValue: (r) => r.valuation, render: (r) => <span className="font-mono-num font-bold text-[#14243A]">{formatMMK(r.valuation, currency)}</span> },
        { key: 'potentialRevenue', header: 'Retail Value', align: 'right', render: (r) => <span className="font-mono-num text-blue-700">{formatMMK(r.potentialRevenue, currency)}</span> },
      ],
    },
    expenses: {
      label: 'Expense Report',
      rows: data?.expenseReport || [],
      csvHeaders: [
        { key: 'expenseNumber', label: 'Ref' },
        { key: 'expenseDate', label: 'Date' },
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description' },
        { key: 'accountName', label: 'Account' },
        { key: 'amount', label: 'Amount' },
      ],
      columns: [
        { key: 'expenseNumber', header: 'Ref #', render: (r) => <span className="font-mono-num text-xs">{r.expenseNumber}</span> },
        { key: 'expenseDate', header: 'Date', render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.expenseDate)}</span> },
        { key: 'category', header: 'Category', render: (r) => r.category },
        { key: 'description', header: 'Description', render: (r) => r.description },
        { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="font-mono-num font-bold text-red-700">{formatMMK(r.amount, currency)}</span> },
      ],
    },
    cash_flow: {
      label: 'Cash Flow & Account Ledger',
      rows: data?.cashFlowReport || [],
      csvHeaders: [
        { key: 'transactionDate', label: 'Date' },
        { key: 'accountName', label: 'Account' },
        { key: 'referenceType', label: 'Type' },
        { key: 'referenceNumber', label: 'Reference' },
        { key: 'direction', label: 'Direction' },
        { key: 'amount', label: 'Amount' },
        { key: 'balanceAfter', label: 'Balance After' },
      ],
      columns: [
        { key: 'transactionDate', header: 'Date', render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.transactionDate)}</span> },
        { key: 'accountName', header: 'Account', render: (r) => r.accountName },
        { key: 'description', header: 'Description', render: (r) => <span className="text-xs">{r.description}</span> },
        {
          key: 'amount',
          header: 'Amount',
          align: 'right',
          render: (r) => (
            <span className={`font-mono-num font-semibold ${r.direction === 'in' ? 'text-emerald-700' : 'text-red-700'}`}>
              {r.direction === 'in' ? '+' : '-'}{formatMMK(r.amount, currency)}
            </span>
          ),
        },
        { key: 'balanceAfter', header: 'Running Bal', align: 'right', render: (r) => <span className="font-mono-num">{formatMMK(r.balanceAfter, '')}</span> },
      ],
    },
    receivables: {
      label: 'Customer Receivables',
      rows: data?.receivablesReport || [],
      csvHeaders: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'customerType', label: 'Type' },
        { key: 'receivableBalance', label: 'Outstanding Debt' },
      ],
      columns: [
        { key: 'code', header: 'Code', render: (r) => <span className="font-mono-num text-xs">{r.code}</span> },
        { key: 'name', header: 'Customer', render: (r) => <span className="font-semibold">{r.name}</span> },
        { key: 'phone', header: 'Phone', render: (r) => r.phone },
        { key: 'receivableBalance', header: 'Receivable Balance', align: 'right', render: (r) => <span className="font-mono-num font-bold text-red-700">{formatMMK(r.receivableBalance, currency)}</span> },
      ],
    },
    payables: {
      label: 'Supplier Payables',
      rows: data?.payablesReport || [],
      csvHeaders: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Supplier' },
        { key: 'phone', label: 'Phone' },
        { key: 'payableBalance', label: 'Outstanding Payable' },
      ],
      columns: [
        { key: 'code', header: 'Code', render: (r) => <span className="font-mono-num text-xs">{r.code}</span> },
        { key: 'name', header: 'Supplier', render: (r) => <span className="font-semibold">{r.name}</span> },
        { key: 'phone', header: 'Phone', render: (r) => r.phone },
        { key: 'payableBalance', header: 'Payable Due', align: 'right', render: (r) => <span className="font-mono-num font-bold text-amber-700">{formatMMK(r.payableBalance, currency)}</span> },
      ],
    },
    purchases: {
      label: 'Purchase History',
      rows: data?.purchaseReport || [],
      csvHeaders: [
        { key: 'purchaseNumber', label: 'Purchase #' },
        { key: 'purchaseDate', label: 'Date' },
        { key: 'supplierName', label: 'Supplier' },
        { key: 'totalAmount', label: 'Total Cost' },
        { key: 'paidAmount', label: 'Paid' },
        { key: 'outstandingAmount', label: 'Payable' },
      ],
      columns: [
        { key: 'purchaseNumber', header: 'Purchase #', render: (r) => <span className="font-mono-num font-semibold">{r.purchaseNumber}</span> },
        { key: 'purchaseDate', header: 'Date', render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.purchaseDate)}</span> },
        { key: 'supplierName', header: 'Supplier', render: (r) => r.supplierName },
        { key: 'totalAmount', header: 'Total Cost', align: 'right', render: (r) => <span className="font-mono-num">{formatMMK(r.totalAmount, currency)}</span> },
        { key: 'outstandingAmount', header: 'Payable', align: 'right', render: (r) => <span className="font-mono-num text-amber-700">{formatMMK(r.outstandingAmount, currency)}</span> },
      ],
    },
  };

  const activeCfg = reportConfigs[reportType];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_reports')}
        subtitle={
          lang === 'my'
            ? 'အရောင်း၊ လက်ကျန်တန်ဖိုး၊ ငွေသားစီးဆင်းမှု၊ ရရန်/ပေးရန် အကြွေးနှင့် အဝယ် အစီရင်ခံစာများ (Excel/CSV ထုတ်ယူနိုင်သည်)'
            : 'Filterable sales, inventory valuation, cash flow, receivables, payables, and procurement reports with Excel-compatible export'
        }
        actions={
          <div className="flex items-center flex-wrap gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono-num bg-white border border-slate-200 rounded-lg"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono-num bg-white border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={() =>
                downloadCSV(`shwesolar-${reportType}-${startDate}-to-${endDate}.csv`, activeCfg.csvHeaders, activeCfg.rows)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV / Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        }
      />

      <div className="flex items-center flex-wrap gap-1.5 bg-white border border-slate-200 rounded-xl p-2">
        {(Object.keys(reportConfigs) as ReportType[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setReportType(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              reportType === key
                ? 'bg-[#14243A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {reportConfigs[key].label}
          </button>
        ))}
      </div>

      <div id="printable-receipt-area">
        <DataTable
          data={activeCfg.rows}
          columns={activeCfg.columns}
          loading={loading}
          pageSize={15}
        />
      </div>
    </div>
  );
};
