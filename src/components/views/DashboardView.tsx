import React, { useEffect, useState, useCallback } from 'react';
import {
  ShoppingCart,
  PackagePlus,
  ArrowUpDown,
  Truck,
  Receipt,
  FileSpreadsheet,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK, getYangonTodayClient } from '../../lib/i18n';
import { PageHeader, StatusText } from '../ui/CommonUI';

const CHART_COLORS = ['#14243A', '#2563EB', '#F59E0B', '#16A34A', '#64748B', '#DC2626'];

type PresetRange = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

function computeDateRange(preset: PresetRange, customStart: string, customEnd: string) {
  const today = getYangonTodayClient();
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  const fmt = (date: Date) => date.toISOString().slice(0, 10);

  if (preset === 'today') return { startDate: today, endDate: today };
  if (preset === 'yesterday') {
    const prev = new Date(dt);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const s = fmt(prev);
    return { startDate: s, endDate: s };
  }
  if (preset === 'week') {
    const start = new Date(dt);
    start.setUTCDate(start.getUTCDate() - 6);
    return { startDate: fmt(start), endDate: today };
  }
  if (preset === 'last_month') {
    const first = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    return { startDate: fmt(first), endDate: fmt(last) };
  }
  if (preset === 'custom' && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }
  // This Month default
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

export const DashboardView: React.FC = () => {
  const { t, lang, bootstrap, setActiveTab, triggerQuickAction, notify } = useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [preset, setPreset] = useState<PresetRange>('month');
  const [customStart, setCustomStart] = useState(() => `${getYangonTodayClient().slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(() => getYangonTodayClient());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const range = computeDateRange(preset, customStart, customEnd);
      const res = await apiRequest(
        `/api/dashboard?startDate=${range.startDate}&endDate=${range.endDate}`
      );
      setData(res);
    } catch (error: any) {
      notify('error', error.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd, notify]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const kpis = data?.kpis || {};
  const charts = data?.charts || {};
  const widgets = data?.widgets || {};

  const kpiCards = [
    { label: t('kpi_today_sales'), value: formatMMK(kpis.todaySales, currency), tone: 'text-[#14243A]' },
    { label: t('kpi_today_collected'), value: formatMMK(kpis.todayCollectedPayments, currency), tone: 'text-emerald-700' },
    { label: t('kpi_today_expenses'), value: formatMMK(kpis.todayExpenses, currency), tone: 'text-red-700' },
    { label: t('kpi_today_gross_profit'), value: formatMMK(kpis.todayGrossProfit, currency), tone: 'text-blue-700' },
    { label: t('kpi_monthly_revenue'), value: formatMMK(kpis.monthlyRevenue, currency), tone: 'text-[#14243A]' },
    {
      label: t('kpi_monthly_net_profit'),
      value: formatMMK(kpis.monthlyNetProfit, currency),
      tone: Number(kpis.monthlyNetProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700',
    },
    {
      label: t('kpi_inv_qty'),
      value: `${Math.round(Number(kpis.totalInventoryQty || 0)).toLocaleString()} Units`,
      tone: 'text-[#14243A]',
    },
    { label: t('kpi_inv_value'), value: formatMMK(kpis.totalInventoryValue, currency), tone: 'text-[#14243A]' },
    { label: t('kpi_cash_balance'), value: formatMMK(kpis.cashBalance, currency), tone: 'text-amber-700' },
    { label: t('kpi_bank_balance'), value: formatMMK(kpis.bankBalance, currency), tone: 'text-blue-700' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav_dashboard')}
        subtitle={
          lang === 'my'
            ? 'ဆိုလာအရောင်း၊ လက်ကျန်ပစ္စည်းနှင့် ငွေကြေးအခြေအနေ အချိန်နှင့်တပြေးညီ ခြုံငုံသုံးသပ်ချက်'
            : 'Real-time solar sales, inventory valuation, and financial performance overview'
        }
        actions={
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
              {(
                [
                  ['today', 'filter_today'],
                  ['yesterday', 'filter_yesterday'],
                  ['week', 'filter_week'],
                  ['month', 'filter_month'],
                  ['last_month', 'filter_last_month'],
                  ['custom', 'filter_custom'],
                ] as [PresetRange, string][]
              ).map(([id, key]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreset(id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    preset === id
                      ? 'bg-[#14243A] text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadDashboard}
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-[#14243A]"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {preset === 'custom' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
          />
        </div>
      )}

      {/* Quick Actions Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => triggerQuickAction('pos', 'new_sale')}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <ShoppingCart className="w-4 h-4 shrink-0" />
          <span>{t('qa_new_sale')}</span>
        </button>
        <button
          type="button"
          onClick={() => triggerQuickAction('inventory', 'add_product')}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-[#14243A] border border-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <PackagePlus className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{t('qa_add_product')}</span>
        </button>
        <button
          type="button"
          onClick={() => triggerQuickAction('inventory', 'adjust_stock')}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-[#14243A] border border-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <ArrowUpDown className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{t('qa_stock_in')}</span>
        </button>
        <button
          type="button"
          onClick={() => triggerQuickAction('purchases', 'new_purchase')}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-[#14243A] border border-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <Truck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{t('qa_new_purchase')}</span>
        </button>
        <button
          type="button"
          onClick={() => triggerQuickAction('finance', 'add_expense')}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-[#14243A] border border-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <Receipt className="w-4 h-4 text-red-600 shrink-0" />
          <span>{t('qa_add_expense')}</span>
        </button>
        <button
          type="button"
          onClick={() => triggerQuickAction('quotations', 'new_quotation')}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 text-[#14243A] border border-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <FileSpreadsheet className="w-4 h-4 text-slate-700 shrink-0" />
          <span>{t('qa_new_quote')}</span>
        </button>
      </div>

      {/* 10 Real-Time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {kpiCards.map((card, i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="text-xs font-medium text-slate-500">{card.label}</div>
            <div className={`text-lg font-bold font-mono-num mt-2 ${card.tone}`}>
              {loading && !data ? '—' : card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#14243A] mb-4">
            {lang === 'my' ? 'နေ့စဉ် အရောင်းနှင့် အကြမ်းအမြတ် လမ်းကြောင်း' : 'Daily Sales & Gross Profit Trend'}
          </h3>
          <div className="h-64">
            {(charts.dailySalesTrend || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t('no_data')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.dailySalesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any) => formatMMK(v, currency)} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#2563EB" fill="#DBEAFE" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" name="Gross Profit" stroke="#16A34A" fill="#DCFCE7" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#14243A] mb-4">
            {lang === 'my' ? 'လစဉ် ရောင်းအား၊ စရိတ်နှင့် အမြတ်နှိုင်းယှဉ်ချက်' : 'Monthly Revenue, Expenses & Profit Trend'}
          </h3>
          <div className="h-64">
            {(charts.monthlyTrend || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t('no_data')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any) => formatMMK(v, currency)} />
                  <Bar dataKey="revenue" name="Revenue" fill="#14243A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Net Profit" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#14243A] mb-4">
            {lang === 'my' ? 'အရောင်းရဆုံး ဆိုလာပစ္စည်းများ' : 'Best-Selling Products'}
          </h3>
          <div className="h-56">
            {(charts.bestSellingProducts || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">{t('no_data')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.bestSellingProducts} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => (v.length > 16 ? v.slice(0, 16) + '…' : v)}
                  />
                  <Tooltip formatter={(v: any) => formatMMK(v, currency)} />
                  <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#14243A] mb-4">
            {lang === 'my' ? 'ငွေပေးချေမှုနည်းလမ်းအလိုက် အရောင်း' : 'Sales by Payment Method'}
          </h3>
          <div className="h-56">
            {(charts.salesByPaymentMethod || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">{t('no_data')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.salesByPaymentMethod}
                    dataKey="amount"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={72}
                    label={({ name }) => String(name ?? '')}
                  >
                    {(charts.salesByPaymentMethod || []).map((_: any, idx: number) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatMMK(v, currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#14243A] mb-4">
            {lang === 'my' ? 'အသုံးစရိတ် ခွဲခြမ်းစိတ်ဖြာမှု' : 'Expense Breakdown'}
          </h3>
          <div className="h-56">
            {(charts.expenseBreakdown || []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">{t('no_data')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.expenseBreakdown}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={72}
                    label={({ name }) => String(name ?? '')}
                  >
                    {(charts.expenseBreakdown || []).map((_: any, idx: number) => (
                      <Cell key={idx} fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatMMK(v, currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 6 Operational Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Sales */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14243A]">
              {lang === 'my' ? 'လတ်တလော အရောင်းဘောက်ချာများ' : 'Recent Sales'}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(widgets.recentSales || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">{t('no_data')}</div>
            ) : (
              widgets.recentSales.map((s: any) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-mono-num font-semibold text-[#14243A] text-xs">{s.invoiceNumber}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {s.customerName} · {formatDateDDMMYYYY(s.saleDate)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-num font-semibold text-slate-900 text-xs">
                      {formatMMK(s.grandTotal, currency)}
                    </div>
                    <StatusText status={s.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Low Stock Products */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14243A]">
              {lang === 'my' ? 'လက်ကျန်နည်း ပစ္စည်းသတိပေးချက်' : 'Low Stock Alerts'}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Manage Stock
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(widgets.lowStockProducts || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">All solar products above minimum stock level</div>
            ) : (
              widgets.lowStockProducts.map((p: any) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 text-xs truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.sku} · Min: {p.minStockLevel} {p.unit}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-num font-bold text-red-700 text-xs">
                      {Number(p.currentStock)} {p.unit}
                    </div>
                    <StatusText status={Number(p.currentStock) <= 0 ? 'out_of_stock' : 'low_stock'} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Outstanding Customer Debts */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14243A]">
              {lang === 'my' ? 'ဖောက်သည် ရရန်ရှိအကြွေးစာရင်း' : 'Outstanding Customer Debts'}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('customers')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              View CRM
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(widgets.outstandingDebts || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No outstanding customer receivables</div>
            ) : (
              widgets.outstandingDebts.map((c: any) => (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-slate-500">{c.phone} · {c.township || c.customerType}</div>
                  </div>
                  <div className="font-mono-num font-bold text-red-700">
                    {formatMMK(c.receivableBalance, currency)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Warranty Expirations */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14243A]">
              {lang === 'my' ? 'အာမခံသက်တမ်း ကုန်ဆုံးခါနီးပစ္စည်းများ' : 'Upcoming Warranty Expirations'}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('warranty')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Warranty Lookup
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(widgets.upcomingWarranties || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No warranties expiring within 45 days</div>
            ) : (
              widgets.upcomingWarranties.map((w: any) => (
                <div key={w.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{w.productName}</div>
                    <div className="text-slate-500 font-mono-num">
                      S/N: {w.serialNumber} · {w.customerName}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-num font-semibold text-amber-700">
                      {formatDateDDMMYYYY(w.warrantyEndDate)}
                    </div>
                    <StatusText status="expiring_soon" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Purchases */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14243A]">
              {lang === 'my' ? 'လတ်တလော အဝယ်စာရင်းများ' : 'Recent Purchases'}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              View Purchases
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(widgets.recentPurchases || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">{t('no_data')}</div>
            ) : (
              widgets.recentPurchases.map((p: any) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-mono-num font-semibold text-[#14243A]">{p.purchaseNumber}</div>
                    <div className="text-slate-500">{formatDateDDMMYYYY(p.purchaseDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-num font-semibold text-slate-900">
                      {formatMMK(p.totalAmount, currency)}
                    </div>
                    <StatusText status={p.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#14243A]">
              {lang === 'my' ? 'လတ်တလော အသုံးစရိတ်များ' : 'Recent Expenses'}
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('finance')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Finance Ledger
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {(widgets.recentExpenses || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">{t('no_data')}</div>
            ) : (
              widgets.recentExpenses.map((e: any) => (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{e.description}</div>
                    <div className="text-slate-500">
                      {e.category} · {formatDateDDMMYYYY(e.expenseDate)}
                    </div>
                  </div>
                  <div className="font-mono-num font-bold text-red-700 shrink-0 ml-2">
                    -{formatMMK(e.amount, currency)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
