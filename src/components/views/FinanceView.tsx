import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  ArrowLeftRight,
  Lock,
  Unlock,
  Download,
  BookOpen,
  CheckCircle2,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest, downloadCSV } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK, getYangonTodayClient } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

const EXPENSE_CATEGORIES = [
  'Employee Salary',
  'Shop Rent',
  'Electricity',
  'Transportation',
  'Delivery Charges',
  'Maintenance',
  'Internet',
  'Office Supplies',
  'Marketing',
  'Other Expenses',
];

const INCOME_CATEGORIES = [
  'Installation Revenue',
  'Repair Services',
  'Transportation Charges',
  'Other Income',
];

export const FinanceView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify, quickActionIntent, clearQuickActionIntent } =
    useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [tab, setTab] = useState<'accounts' | 'expenses' | 'income' | 'daily' | 'monthly'>('accounts');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [dailyHistory, setDailyHistory] = useState<any[]>([]);
  const [dailyDate, setDailyDate] = useState(getYangonTodayClient());
  const [dailyPreview, setDailyPreview] = useState<any | null>(null);
  const [actualCashCount, setActualCashCount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const [pnlMonth, setPnlMonth] = useState(() => getYangonTodayClient().slice(0, 7));
  const [pnlReport, setPnlReport] = useState<any | null>(null);
  const [monthlyHistory, setMonthlyHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [accForm, setAccForm] = useState({
    name: '',
    accountType: 'bank',
    bankName: '',
    accountNumber: '',
    openingBalance: '0',
  });
  const [transferOpen, setTransferOpen] = useState(false);
  const [trfForm, setTrfForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    transferDate: getYangonTodayClient(),
    notes: '',
  });
  const [ledgerAcc, setLedgerAcc] = useState<any | null>(null);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);

  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    category: 'Shop Rent',
    description: '',
    amount: '',
    expenseDate: getYangonTodayClient(),
    accountId: '',
    paymentMethod: 'Cash',
    notes: '',
  });

  const [addIncomeOpen, setAddIncomeOpen] = useState(false);
  const [incForm, setIncForm] = useState({
    category: 'Installation Revenue',
    description: '',
    amount: '',
    incomeDate: getYangonTodayClient(),
    accountId: '',
    paymentMethod: 'KBZPay',
    notes: '',
  });

  const [reopenTarget, setReopenTarget] = useState<any | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, exps, incs, dHist, mHist] = await Promise.all([
        apiRequest<any[]>('/api/accounts'),
        apiRequest<any[]>('/api/expenses'),
        apiRequest<any[]>('/api/income'),
        apiRequest<any[]>('/api/daily-closings'),
        apiRequest<any[]>('/api/monthly-closings'),
      ]);
      setAccounts(accs);
      setExpenses(exps);
      setIncome(incs);
      setDailyHistory(dHist);
      setMonthlyHistory(mHist);
      if (accs.length > 0 && !expForm.accountId) {
        setExpForm((f) => ({ ...f, accountId: accs[0].id }));
        setIncForm((f) => ({ ...f, accountId: accs[0].id }));
      }
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (quickActionIntent === 'add_expense') {
      setTab('expenses');
      setAddExpenseOpen(true);
      clearQuickActionIntent();
    }
  }, [quickActionIntent, clearQuickActionIntent]);

  const loadDailyPreview = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/daily-closings/preview?date=${dailyDate}`);
      setDailyPreview(data);
      setActualCashCount(String(Math.round(Number(data.expectedClosingCash || 0))));
    } catch (error: any) {
      notify('error', error.message);
    }
  }, [dailyDate, notify]);

  useEffect(() => {
    if (tab === 'daily') loadDailyPreview();
  }, [tab, loadDailyPreview]);

  const loadMonthlyPnL = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/monthly-closings/report?month=${pnlMonth}`);
      setPnlReport(data);
    } catch (error: any) {
      notify('error', error.message);
    }
  }, [pnlMonth, notify]);

  useEffect(() => {
    if (tab === 'monthly') loadMonthlyPnL();
  }, [tab, loadMonthlyPnL]);

  const openLedger = async (acc: any) => {
    setLedgerAcc(acc);
    try {
      const rows = await apiRequest<any[]>(`/api/accounts/${acc.id}/ledger`);
      setLedgerRows(rows);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/accounts', { method: 'POST', body: accForm });
      notify('success', 'Financial account created.');
      setAddAccountOpen(false);
      await Promise.all([loadAll(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/accounts/transfer', { method: 'POST', body: trfForm });
      notify('success', 'Internal fund transfer completed (not counted as income or expense).');
      setTransferOpen(false);
      await Promise.all([loadAll(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/expenses', { method: 'POST', body: expForm });
      notify('success', 'Expense recorded and account updated.');
      setAddExpenseOpen(false);
      setExpForm({ ...expForm, description: '', amount: '', notes: '' });
      await Promise.all([loadAll(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/income', { method: 'POST', body: incForm });
      notify('success', 'Other income recorded.');
      setAddIncomeOpen(false);
      setIncForm({ ...incForm, description: '', amount: '', notes: '' });
      await Promise.all([loadAll(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/daily-closings', {
        method: 'POST',
        body: {
          businessDate: dailyDate,
          actualCashCount: Number(actualCashCount || 0),
          notes: closingNotes,
        },
      });
      notify('success', `Daily accounts for ${formatDateDDMMYYYY(dailyDate)} closed & locked.`);
      setClosingNotes('');
      await Promise.all([loadAll(), loadDailyPreview()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleReopenDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget) return;
    try {
      await apiRequest(`/api/daily-closings/${reopenTarget.id}/reopen`, {
        method: 'POST',
        body: { reason: reopenReason },
      });
      notify('success', `Closed day ${formatDateDDMMYYYY(reopenTarget.businessDate)} reopened with audit trail.`);
      setReopenTarget(null);
      setReopenReason('');
      await Promise.all([loadAll(), loadDailyPreview()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleFinalizeMonth = async () => {
    try {
      await apiRequest('/api/monthly-closings/finalize', {
        method: 'POST',
        body: { periodMonth: pnlMonth, notes: `Monthly P&L reconciled for ${pnlMonth}` },
      });
      notify('success', `Monthly closing for ${pnlMonth} finalized.`);
      await Promise.all([loadAll(), loadMonthlyPnL()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const expCols: ColumnDef<any>[] = [
    {
      key: 'expenseNumber',
      header: 'Ref #',
      render: (r) => <span className="font-mono-num text-xs font-semibold">{r.expenseNumber}</span>,
    },
    {
      key: 'expenseDate',
      header: 'Date',
      sortable: true,
      sortValue: (r) => r.expenseDate,
      render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.expenseDate)}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-xs font-semibold text-[#14243A]">{r.category}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => <span className="text-xs text-slate-600">{r.description}</span>,
    },
    {
      key: 'accountName',
      header: 'Account',
      render: (r) => <span className="text-xs text-slate-500">{r.accountName}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.amount),
      render: (r) => (
        <span className="font-mono-num text-xs font-bold text-red-700">
          -{formatMMK(r.amount, currency)}
        </span>
      ),
    },
  ];

  const incCols: ColumnDef<any>[] = [
    {
      key: 'incomeNumber',
      header: 'Ref #',
      render: (r) => <span className="font-mono-num text-xs font-semibold">{r.incomeNumber}</span>,
    },
    {
      key: 'incomeDate',
      header: 'Date',
      sortable: true,
      sortValue: (r) => r.incomeDate,
      render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.incomeDate)}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-xs font-semibold text-[#14243A]">{r.category}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => <span className="text-xs text-slate-600">{r.description}</span>,
    },
    {
      key: 'accountName',
      header: 'Account',
      render: (r) => <span className="text-xs text-slate-500">{r.accountName}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.amount),
      render: (r) => (
        <span className="font-mono-num text-xs font-bold text-emerald-700">
          +{formatMMK(r.amount, currency)}
        </span>
      ),
    },
  ];

  const cashDiff =
    dailyPreview !== null
      ? Number(actualCashCount || 0) - Number(dailyPreview.expectedClosingCash || 0)
      : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_finance')}
        subtitle={
          lang === 'my'
            ? 'ငွေသားနှင့် ဘဏ်အကောင့်များ၊ ဝင်ငွေ/အသုံးစရိတ်၊ နေ့စဉ်ငွေစာရင်းပိတ်ခြင်းနှင့် လစဉ် အရှုံးအမြတ် (P&L)'
            : 'Cash & bank accounts, transfers, income & expenses, end-of-day cash closing, and monthly P&L reconciliation'
        }
        actions={
          <div className="flex items-center flex-wrap gap-1 p-1 bg-white border border-slate-200 rounded-lg">
            {(
              [
                ['accounts', 'Cash & Banks'],
                ['expenses', 'Expenses'],
                ['income', 'Other Income'],
                ['daily', 'Daily Closing'],
                ['monthly', 'Monthly P&L'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  tab === id ? 'bg-[#14243A] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* TAB 1: CASH & BANK ACCOUNTS */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-[#14243A] rounded-lg"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
              <span>Transfer Between Accounts</span>
            </button>
            <button
              type="button"
              onClick={() => setAddAccountOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Add Financial Account</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="capitalize font-medium">{acc.accountType}</span>
                    <span>{acc.bankName}</span>
                  </div>
                  <h3 className="text-base font-bold text-[#14243A] mt-1">{acc.name}</h3>
                  <div className="text-2xl font-bold font-mono-num text-[#14243A] mt-3">
                    {formatMMK(acc.currentBalance, currency)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-num mt-1">
                    Opening: {formatMMK(acc.openingBalance, currency)}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openLedger(acc)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>View Account Ledger</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: EXPENSES */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                downloadCSV(
                  'expenses.csv',
                  [
                    { key: 'expenseNumber', label: 'Ref' },
                    { key: 'expenseDate', label: 'Date' },
                    { key: 'category', label: 'Category' },
                    { key: 'description', label: 'Description' },
                    { key: 'accountName', label: 'Account' },
                    { key: 'amount', label: 'Amount' },
                  ],
                  expenses
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setAddExpenseOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>
          <DataTable
            data={expenses}
            columns={expCols}
            loading={loading}
            searchPlaceholder="Search expense category, description..."
            searchFilter={(r, q) =>
              r.category.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
            }
          />
        </div>
      )}

      {/* TAB 3: OTHER INCOME */}
      {tab === 'income' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddIncomeOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Record Other Income</span>
            </button>
          </div>
          <DataTable
            data={income}
            columns={incCols}
            loading={loading}
            searchPlaceholder="Search installation, repair, transport income..."
            searchFilter={(r, q) =>
              r.category.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
            }
          />
        </div>
      )}

      {/* TAB 4: DAILY CLOSING */}
      {tab === 'daily' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-[#14243A]">Daily Cash & Account Reconciliation</h3>
                <p className="text-xs text-slate-500">
                  Physical cash drawer is reconciled separately from KBZPay, WavePay, and bank accounts.
                </p>
              </div>
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono-num"
              />
            </div>

            {dailyPreview && (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-600">Opening Physical Cash</span>
                    <span className="font-mono-num font-semibold">
                      {formatMMK(dailyPreview.openingCash, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">+ Cash POS Sales</span>
                    <span className="font-mono-num text-emerald-700">
                      +{formatMMK(dailyPreview.cashSales, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">+ Customer Debt Collections (Cash)</span>
                    <span className="font-mono-num text-emerald-700">
                      +{formatMMK(dailyPreview.debtCollectionsCash, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-600">+ Other Cash Income</span>
                    <span className="font-mono-num text-emerald-700">
                      +{formatMMK(dailyPreview.otherCashIncome, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">- Operating Expenses (Cash)</span>
                    <span className="font-mono-num text-red-700">
                      -{formatMMK(dailyPreview.operatingExpensesCash, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-600">- Supplier Payments (Cash)</span>
                    <span className="font-mono-num text-red-700">
                      -{formatMMK(dailyPreview.supplierPaymentsCash, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-200">
                    <span className="text-slate-600">- Other Cash Out (Transfers / Refunds)</span>
                    <span className="font-mono-num text-red-700">
                      -{formatMMK(dailyPreview.otherCashOut, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 text-base font-bold text-[#14243A]">
                    <span>Expected Closing Physical Cash</span>
                    <span className="font-mono-num">
                      {formatMMK(dailyPreview.expectedClosingCash, currency)}
                    </span>
                  </div>
                </div>

                {/* Digital Accounts Separate Reconciliation */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="text-xs font-bold text-[#14243A] mb-2">
                    Separate Digital & Bank Account Movements ({formatDateDDMMYYYY(dailyDate)})
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {(dailyPreview.accountReconciliations || [])
                      .filter((a: any) => a.accountType !== 'cash')
                      .map((a: any) => (
                        <div key={a.accountId} className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">{a.accountName}</span>
                          <span className="font-mono-num text-slate-600">
                            In: +{formatMMK(a.dayIn, '')} · Out: -{formatMMK(a.dayOut, '')} · Bal:{' '}
                            <strong className="text-[#14243A]">{formatMMK(a.currentBalance, '')}</strong>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {dailyPreview.existingClosing?.status === 'closed' ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                    <div className="text-xs text-emerald-900">
                      <div className="font-bold flex items-center gap-1.5">
                        <Lock className="w-4 h-4" />
                        <span>Business Date Closed & Locked</span>
                      </div>
                      <div className="mt-1">
                        Actual Cash Counted:{' '}
                        <strong className="font-mono-num">
                          {formatMMK(dailyPreview.existingClosing.actualCashCount, currency)}
                        </strong>{' '}
                        · Variance:{' '}
                        <strong className="font-mono-num">
                          {formatMMK(dailyPreview.existingClosing.cashDifference, currency)}
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReopenTarget(dailyPreview.existingClosing)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-50 shrink-0"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Reopen Day</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCloseDay} className="space-y-3 pt-2 border-t border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Actual Physical Cash Count ({currency}) *
                        </label>
                        <input
                          type="number"
                          required
                          value={actualCashCount}
                          onChange={(e) => setActualCashCount(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono-num font-bold border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="flex flex-col justify-center bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-500">Cash Difference (Over / Short)</span>
                        <span
                          className={`text-sm font-mono-num font-bold ${
                            Math.abs(cashDiff) < 1
                              ? 'text-emerald-700'
                              : cashDiff > 0
                                ? 'text-blue-700'
                                : 'text-red-700'
                          }`}
                        >
                          {cashDiff > 0 ? `+${formatMMK(cashDiff, currency)}` : formatMMK(cashDiff, currency)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Closing Notes</label>
                      <input
                        value={closingNotes}
                        onChange={(e) => setClosingNotes(e.target.value)}
                        placeholder="Cash drawer verified & sealed..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 text-sm font-bold text-white bg-[#14243A] hover:bg-[#1e3554] rounded-lg flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Close & Lock Business Day ({formatDateDDMMYYYY(dailyDate)})</span>
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 font-bold text-sm text-[#14243A]">
              Daily Closing History
            </div>
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {dailyHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No daily closings recorded yet.</div>
              ) : (
                dailyHistory.map((d) => (
                  <div key={d.id} className="p-4 text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono-num font-bold text-[#14243A]">
                        {formatDateDDMMYYYY(d.businessDate)}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Expected: {formatMMK(d.expectedClosingCash, '')} · Counted:{' '}
                        {formatMMK(d.actualCashCount, '')}
                      </div>
                      <div className="text-[11px] text-slate-400">By {d.closedByName}</div>
                    </div>
                    <div className="text-right">
                      <StatusText status={d.status} />
                      <div
                        className={`font-mono-num font-semibold mt-0.5 ${
                          Number(d.cashDifference) === 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        Diff: {formatMMK(d.cashDifference, '')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MONTHLY CLOSING & P&L */}
      {tab === 'monthly' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-[#14243A]">Accounting Period:</label>
              <input
                type="month"
                value={pnlMonth}
                onChange={(e) => setPnlMonth(e.target.value)}
                className="px-3 py-1.5 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
              {pnlReport?.finalizedRecord && <StatusText status={pnlReport.finalizedRecord.status} />}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print P&L</span>
              </button>
              <button
                type="button"
                onClick={handleFinalizeMonth}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14243A] hover:bg-[#1e3554] rounded-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Finalize Monthly Closing</span>
              </button>
            </div>
          </div>

          {pnlReport && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="printable-receipt-area">
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-base font-bold text-[#14243A] mb-4">
                  Profit & Loss Statement ({pnlMonth} vs {pnlReport.previousMonth})
                </h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 text-xs text-slate-500">
                      <th className="py-2 text-left">Line Item</th>
                      <th className="py-2 text-right">{pnlMonth}</th>
                      <th className="py-2 text-right">{pnlReport.previousMonth}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ['Total Sales Revenue', 'salesRevenue', false],
                      ['Less: Sales Returns', 'salesReturnsTotal', false],
                      ['Net Sales', 'netSales', true],
                      ['Less: Cost of Goods Sold (COGS)', 'cogs', false],
                      ['Gross Profit', 'grossProfit', true],
                      ['Add: Other Income (Installation / Repair)', 'otherIncome', false],
                      ['Less: Operating Expenses', 'operatingExpenses', false],
                      ['Less: Other Expenses', 'otherExpenses', false],
                      ['Net Profit / (Loss)', 'netProfit', true],
                    ].map(([label, key, bold]) => (
                      <tr key={String(key)} className={bold ? 'bg-slate-50 font-bold text-[#14243A]' : ''}>
                        <td className="py-2.5 pr-4">{String(label)}</td>
                        <td className="py-2.5 text-right font-mono-num">
                          {formatMMK(pnlReport.current[String(key)], currency)}
                        </td>
                        <td className="py-2.5 text-right font-mono-num text-slate-500">
                          {formatMMK(pnlReport.previous[String(key)], currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-xs">
                  <h4 className="font-bold text-sm text-[#14243A] pb-2 border-b border-slate-100">
                    Closing Balance Sheet Snapshot
                  </h4>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Cash Balance</span>
                    <span className="font-mono-num font-semibold">
                      {formatMMK(pnlReport.current.cashBalance, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Bank & Digital Balances</span>
                    <span className="font-mono-num font-semibold">
                      {formatMMK(pnlReport.current.bankBalances, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Closing Inventory Value</span>
                    <span className="font-mono-num font-semibold">
                      {formatMMK(pnlReport.current.closingInventoryValue, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Customer Receivables</span>
                    <span className="font-mono-num font-semibold text-blue-700">
                      {formatMMK(pnlReport.current.totalReceivables, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Supplier Payables</span>
                    <span className="font-mono-num font-semibold text-amber-700">
                      {formatMMK(pnlReport.current.totalPayables, currency)}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 text-xs">
                  <h4 className="font-bold text-sm text-[#14243A] mb-2">Finalized Months</h4>
                  {monthlyHistory.length === 0 ? (
                    <p className="text-slate-400">No months finalized yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {monthlyHistory.map((m) => (
                        <div key={m.id} className="flex justify-between py-1.5 border-b border-slate-100">
                          <span className="font-mono-num font-semibold">{m.periodMonth}</span>
                          <span className="font-mono-num font-bold text-emerald-700">
                            {formatMMK(m.netProfit, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account Ledger Modal */}
      <Modal
        open={Boolean(ledgerAcc)}
        onClose={() => setLedgerAcc(null)}
        title={`Account Ledger — ${ledgerAcc?.name || ''}`}
        subtitle={`Current Balance: ${formatMMK(ledgerAcc?.currentBalance, currency)}`}
        size="xl"
      >
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 text-left">Date</th>
              <th className="py-2 text-left">Reference</th>
              <th className="py-2 text-left">Description</th>
              <th className="py-2 text-right">In / Out</th>
              <th className="py-2 text-right">Balance After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ledgerRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  No ledger entries yet
                </td>
              </tr>
            ) : (
              ledgerRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 font-mono-num">{formatDateDDMMYYYY(row.transactionDate)}</td>
                  <td className="py-2 font-mono-num text-blue-700">{row.referenceNumber}</td>
                  <td className="py-2">{row.description}</td>
                  <td
                    className={`py-2 text-right font-mono-num font-semibold ${
                      row.direction === 'in' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {row.direction === 'in' ? '+' : '-'}
                    {formatMMK(row.amount, '')}
                  </td>
                  <td className="py-2 text-right font-mono-num font-bold text-[#14243A]">
                    {formatMMK(row.balanceAfter, '')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Modal>

      {/* Add Financial Account Modal */}
      <Modal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} title="Add Financial Account" size="md">
        <form onSubmit={handleAddAccount} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Account Name *</label>
            <input
              required
              value={accForm.name}
              onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
              placeholder="e.g. CB Bank Business"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
              <select
                value={accForm.accountType}
                onChange={(e) => setAccForm({ ...accForm, accountType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="cash">Cash</option>
                <option value="kbzpay">KBZPay</option>
                <option value="wavepay">WavePay</option>
                <option value="bank">Bank Account</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Balance</label>
              <input
                type="number"
                min="0"
                value={accForm.openingBalance}
                onChange={(e) => setAccForm({ ...accForm, openingBalance: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddAccountOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* Account Transfer Modal */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Internal Account Transfer"
        subtitle="Moves money between your shop accounts without affecting revenue or expenses."
        size="md"
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">From Account *</label>
              <select
                required
                value={trfForm.fromAccountId}
                onChange={(e) => setTrfForm({ ...trfForm, fromAccountId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Source</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatMMK(a.currentBalance, '')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">To Account *</label>
              <select
                required
                value={trfForm.toAccountId}
                onChange={(e) => setTrfForm({ ...trfForm, toAccountId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Destination</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency}) *</label>
              <input
                type="number"
                required
                min="1"
                value={trfForm.amount}
                onChange={(e) => setTrfForm({ ...trfForm, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transfer Date</label>
              <input
                type="date"
                value={trfForm.transferDate}
                onChange={(e) => setTrfForm({ ...trfForm, transferDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              value={trfForm.notes}
              onChange={(e) => setTrfForm({ ...trfForm, notes: e.target.value })}
              placeholder="e.g. Evening cash deposit to KBZ Bank"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTransferOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Confirm Transfer
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Expense Modal */}
      <Modal open={addExpenseOpen} onClose={() => setAddExpenseOpen(false)} title="Record Operating Expense" size="md">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
              <select
                value={expForm.category}
                onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={expForm.expenseDate}
                onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
            <input
              required
              value={expForm.description}
              onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
              placeholder="e.g. Monthly showroom electricity bill"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency}) *</label>
              <input
                type="number"
                required
                min="1"
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Account *</label>
              <select
                required
                value={expForm.accountId}
                onChange={(e) => setExpForm({ ...expForm, accountId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddExpenseOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Save Expense
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Other Income Modal */}
      <Modal open={addIncomeOpen} onClose={() => setAddIncomeOpen(false)} title="Record Non-Sales Income" size="md">
        <form onSubmit={handleAddIncome} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Income Category *</label>
              <select
                value={incForm.category}
                onChange={(e) => setIncForm({ ...incForm, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {INCOME_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={incForm.incomeDate}
                onChange={(e) => setIncForm({ ...incForm, incomeDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
            <input
              required
              value={incForm.description}
              onChange={(e) => setIncForm({ ...incForm, description: e.target.value })}
              placeholder="e.g. Inverter firmware repair & maintenance"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency}) *</label>
              <input
                type="number"
                required
                min="1"
                value={incForm.amount}
                onChange={(e) => setIncForm({ ...incForm, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Account *</label>
              <select
                required
                value={incForm.accountId}
                onChange={(e) => setIncForm({ ...incForm, accountId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddIncomeOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg">
              Save Income
            </button>
          </div>
        </form>
      </Modal>

      {/* Reopen Closed Day Modal */}
      <Modal
        open={Boolean(reopenTarget)}
        onClose={() => setReopenTarget(null)}
        title={`Reopen Closed Day — ${formatDateDDMMYYYY(reopenTarget?.businessDate)}`}
        subtitle="Requires Owner or Accountant authorization and logs a permanent audit record."
        size="md"
      >
        <form onSubmit={handleReopenDay} className="space-y-4">
          <textarea
            required
            rows={3}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Mandatory reason for reopening closed daily accounts..."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReopenTarget(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg">
              Authorize Reopen
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
