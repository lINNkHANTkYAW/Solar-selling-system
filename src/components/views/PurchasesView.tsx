import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle, CreditCard, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK, getYangonTodayClient } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

interface PurchaseLine {
  productId: string;
  quantity: number;
  unitCost: number;
}

export const PurchasesView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify, quickActionIntent, clearQuickActionIntent } =
    useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(getYangonTodayClient());
  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: '', quantity: 1, unitCost: 0 }]);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [additionalCharges, setAdditionalCharges] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [accountId, setAccountId] = useState('');
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [notes, setNotes] = useState('');

  // Pay Supplier & Return Modals
  const [payPurchase, setPayPurchase] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'Bank Transfer', accountId: '', note: '' });
  const [retPurchase, setRetPurchase] = useState<any | null>(null);
  const [retForm, setRetForm] = useState({
    purchaseItemId: '',
    quantity: '1',
    settlementType: 'payable_adjustment',
    refundAccountId: '',
    reason: '',
  });
  const [detailPurchase, setDetailPurchase] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [purs, sups, prods] = await Promise.all([
        apiRequest<any[]>('/api/purchases'),
        apiRequest<any[]>('/api/suppliers'),
        apiRequest<any[]>('/api/products'),
      ]);
      setPurchases(purs);
      setSuppliers(sups);
      setProducts(prods);
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (bootstrap?.accounts?.length && !accountId) {
      setAccountId(bootstrap.accounts[0].id);
    }
  }, [bootstrap, accountId]);

  useEffect(() => {
    if (quickActionIntent === 'new_purchase') {
      setCreateOpen(true);
      clearQuickActionIntent();
    }
  }, [quickActionIntent, clearQuickActionIntent]);

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const totalAmount = Math.max(
    0,
    subtotal - Number(discountAmount || 0) + Number(additionalCharges || 0)
  );
  const remainingPayable = saveAsDraft
    ? totalAmount
    : Math.max(0, totalAmount - Number(paidAmount || 0));

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (!supplierId || validLines.length === 0) {
      notify('error', 'Select a supplier and add at least one product line.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/purchases', {
        method: 'POST',
        body: {
          supplierId,
          purchaseDate,
          items: validLines,
          discountAmount: Number(discountAmount || 0),
          additionalCharges: Number(additionalCharges || 0),
          paidAmount: saveAsDraft ? 0 : Number(paidAmount || 0),
          paymentMethod,
          accountId,
          status: saveAsDraft ? 'draft' : 'received',
          notes,
        },
      });
      notify(
        'success',
        saveAsDraft
          ? 'Draft purchase saved (inventory unchanged).'
          : 'Purchase received: stock & Weighted Average Cost updated atomically.'
      );
      setCreateOpen(false);
      setLines([{ productId: '', quantity: 1, unitCost: 0 }]);
      setPaidAmount('0');
      setNotes('');
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message || 'Purchase save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleReceiveDraft = async (pur: any) => {
    try {
      await apiRequest(`/api/purchases/${pur.id}/receive`, {
        method: 'POST',
        body: { paidAmount: 0, paymentMethod: pur.paymentMethod, accountId },
      });
      notify('success', `Purchase ${pur.purchaseNumber} received into inventory.`);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handlePaySupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPurchase) return;
    try {
      await apiRequest(`/api/purchases/${payPurchase.id}/pay`, {
        method: 'POST',
        body: {
          amount: Number(payForm.amount),
          paymentMethod: payForm.paymentMethod,
          accountId: payForm.accountId || accountId,
          referenceNote: payForm.note,
          idempotencyKey: `PPAY-${payPurchase.id}-${Date.now()}`,
        },
      });
      notify('success', 'Supplier payment recorded (Payable and account balance reduced cleanly).');
      setPayPurchase(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handlePurchaseReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retPurchase) return;
    try {
      await apiRequest(`/api/purchases/${retPurchase.id}/return`, {
        method: 'POST',
        body: {
          purchaseItemId: retForm.purchaseItemId,
          quantity: Number(retForm.quantity),
          settlementType: retForm.settlementType,
          refundAccountId: retForm.refundAccountId || accountId,
          reason: retForm.reason,
        },
      });
      notify('success', 'Supplier purchase return recorded.');
      setRetPurchase(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      key: 'purchaseNumber',
      header: 'Purchase #',
      sortable: true,
      sortValue: (r) => r.purchaseNumber,
      render: (r) => (
        <button
          type="button"
          onClick={async () => {
            const full = await apiRequest(`/api/purchases/${r.id}`);
            setDetailPurchase(full);
          }}
          className="font-mono-num font-semibold text-blue-700 hover:underline"
        >
          {r.purchaseNumber}
        </button>
      ),
    },
    {
      key: 'purchaseDate',
      header: 'Date',
      sortable: true,
      sortValue: (r) => r.purchaseDate,
      render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.purchaseDate)}</span>,
    },
    {
      key: 'supplierName',
      header: 'Supplier',
      sortable: true,
      sortValue: (r) => r.supplierName,
      render: (r) => <span className="font-medium">{r.supplierName}</span>,
    },
    {
      key: 'totalAmount',
      header: 'Total Cost',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.totalAmount),
      render: (r) => <span className="font-mono-num font-semibold">{formatMMK(r.totalAmount, currency)}</span>,
    },
    {
      key: 'paidAmount',
      header: 'Paid',
      align: 'right',
      render: (r) => <span className="font-mono-num text-emerald-700">{formatMMK(r.paidAmount, '')}</span>,
    },
    {
      key: 'outstandingAmount',
      header: 'Payable Due',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.outstandingAmount),
      render: (r) => (
        <span
          className={`font-mono-num font-semibold ${
            Number(r.outstandingAmount) > 0 ? 'text-amber-700' : 'text-slate-400'
          }`}
        >
          {formatMMK(r.outstandingAmount, currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {r.status === 'draft' && (
            <button
              type="button"
              onClick={() => handleReceiveDraft(r)}
              title="Confirm & Receive Stock"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Receive</span>
            </button>
          )}
          {r.status !== 'draft' && r.status !== 'cancelled' && Number(r.outstandingAmount) > 0 && (
            <button
              type="button"
              onClick={() => {
                setPayPurchase(r);
                setPayForm({
                  amount: String(Number(r.outstandingAmount)),
                  paymentMethod: 'Bank Transfer',
                  accountId,
                  note: '',
                });
              }}
              title="Record Supplier Payment"
              className="p-1.5 text-blue-700 hover:bg-blue-50 rounded"
            >
              <CreditCard className="w-4 h-4" />
            </button>
          )}
          {r.status !== 'draft' && r.status !== 'cancelled' && (r.items || []).length > 0 && (
            <button
              type="button"
              onClick={() => {
                setRetPurchase(r);
                setRetForm({
                  purchaseItemId: r.items[0]?.id || '',
                  quantity: '1',
                  settlementType: 'payable_adjustment',
                  refundAccountId: accountId,
                  reason: '',
                });
              }}
              title="Supplier Return"
              className="p-1.5 text-amber-700 hover:bg-amber-50 rounded"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_purchases')}
        subtitle={
          lang === 'my'
            ? 'ကုန်ပေးသွင်းသူများထံမှ ပစ္စည်းအဝယ်စာရင်း၊ Weighted Average Cost တွက်ချက်မှုနှင့် ပေးရန်ရှိအကြွေးစီမံခန့်ခွဲမှု'
            : 'Supplier stock procurement, Weighted Average Costing (WAC), partial payable settlements, and purchase returns'
        }
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>{t('qa_new_purchase')}</span>
          </button>
        }
      />

      <DataTable
        data={purchases}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search purchase #, supplier name..."
        searchFilter={(r, q) =>
          r.purchaseNumber.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q)
        }
      />

      {/* New Purchase Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Stock Purchase"
        subtitle="Inventory increases and Weighted Average Cost updates only when received (not for Drafts)."
        size="xl"
      >
        <form onSubmit={handleCreatePurchase} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier *</label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#14243A]">Products to Procure</h4>
              <button
                type="button"
                onClick={() => setLines([...lines, { productId: '', quantity: 1, unitCost: 0 }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Line</span>
              </button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.productId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const p = products.find((x) => x.id === pid);
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, productId: pid, unitCost: Number(p?.purchasePrice || 0) } : l
                      )
                    );
                  }}
                  className="col-span-5 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Solar Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, quantity: Number(e.target.value || 0) } : l))
                    )
                  }
                  className="col-span-2 px-2.5 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Unit Cost"
                  value={line.unitCost}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, unitCost: Number(e.target.value || 0) } : l))
                    )
                  }
                  className="col-span-3 px-2.5 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
                <div className="col-span-1 text-right font-mono-num text-xs font-semibold">
                  {formatMMK(line.quantity * line.unitCost, '')}
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 flex justify-end text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-3 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Discount ({currency})</label>
              <input
                type="number"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Freight / Charges</label>
              <input
                type="number"
                min="0"
                value={additionalCharges}
                onChange={(e) => setAdditionalCharges(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Paid Now</label>
              <input
                type="number"
                min="0"
                disabled={saveAsDraft}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="KBZPay">KBZPay</option>
                <option value="WavePay">WavePay</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pay From Account</label>
              <select
                value={accountId}
                disabled={saveAsDraft}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:opacity-50"
              >
                {(bootstrap?.accounts || []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatMMK(a.currentBalance, '')})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsDraft}
                  onChange={(e) => setSaveAsDraft(e.target.checked)}
                  className="w-4 h-4 accent-[#2563EB]"
                />
                <span>Save as Draft (Do not receive stock yet)</span>
              </label>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-wrap justify-between gap-4 text-xs">
            <div>
              Subtotal: <strong className="font-mono-num">{formatMMK(subtotal, currency)}</strong>
            </div>
            <div>
              Grand Total: <strong className="font-mono-num text-[#14243A]">{formatMMK(totalAmount, currency)}</strong>
            </div>
            <div>
              Remaining Payable:{' '}
              <strong className="font-mono-num text-amber-700">{formatMMK(remainingPayable, currency)}</strong>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              {saving ? 'Saving...' : saveAsDraft ? 'Save Draft' : 'Confirm & Receive Stock'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Payment Modal */}
      <Modal
        open={Boolean(payPurchase)}
        onClose={() => setPayPurchase(null)}
        title={`Pay Supplier — ${payPurchase?.purchaseNumber || ''}`}
        subtitle="Decreases account balance and supplier payable without double-counting an expense."
        size="md"
      >
        <form onSubmit={handlePaySupplier} className="space-y-4">
          <div className="text-xs text-slate-600">
            Outstanding Payable:{' '}
            <strong className="font-mono-num text-amber-700">
              {formatMMK(payPurchase?.outstandingAmount, currency)}
            </strong>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Amount *</label>
            <input
              type="number"
              required
              min="1"
              max={Number(payPurchase?.outstandingAmount || 0)}
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Method</label>
              <select
                value={payForm.paymentMethod}
                onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="KBZPay">KBZPay</option>
                <option value="WavePay">WavePay</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account</label>
              <select
                value={payForm.accountId}
                onChange={(e) => setPayForm({ ...payForm, accountId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(bootstrap?.accounts || []).map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPayPurchase(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Submit Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase Return Modal */}
      <Modal
        open={Boolean(retPurchase)}
        onClose={() => setRetPurchase(null)}
        title={`Purchase Return — ${retPurchase?.purchaseNumber || ''}`}
        size="md"
      >
        <form onSubmit={handlePurchaseReturn} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Product to Return</label>
            <select
              value={retForm.purchaseItemId}
              onChange={(e) => setRetForm({ ...retForm, purchaseItemId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {(retPurchase?.items || []).map((it: any) => (
                <option key={it.id} value={it.id}>
                  {it.productName} (Qty: {Number(it.quantity)}, Returned: {Number(it.returnedQuantity)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Return Quantity *</label>
              <input
                type="number"
                required
                min="1"
                value={retForm.quantity}
                onChange={(e) => setRetForm({ ...retForm, quantity: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Settlement</label>
              <select
                value={retForm.settlementType}
                onChange={(e) => setRetForm({ ...retForm, settlementType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="payable_adjustment">Reduce Supplier Payable</option>
                <option value="cash_refund">Refund to Account</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Return Reason *</label>
            <input
              required
              value={retForm.reason}
              onChange={(e) => setRetForm({ ...retForm, reason: e.target.value })}
              placeholder="e.g. Defective MPPT board on arrival"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRetPurchase(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg">
              Confirm Supplier Return
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase Details Modal */}
      <Modal
        open={Boolean(detailPurchase)}
        onClose={() => setDetailPurchase(null)}
        title={`Purchase Details — ${detailPurchase?.purchaseNumber || ''}`}
        size="lg"
      >
        {detailPurchase && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <div className="text-slate-500">Supplier</div>
                <div className="font-semibold text-[#14243A]">{detailPurchase.supplier?.name}</div>
              </div>
              <div>
                <div className="text-slate-500">Total Amount</div>
                <div className="font-mono-num font-bold">{formatMMK(detailPurchase.totalAmount, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Payable Due</div>
                <div className="font-mono-num font-bold text-amber-700">
                  {formatMMK(detailPurchase.outstandingAmount, currency)}
                </div>
              </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left">Product</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit Cost</th>
                  <th className="py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(detailPurchase.items || []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="py-2 font-medium">{it.productName}</td>
                    <td className="py-2 text-right font-mono-num">{Number(it.quantity)}</td>
                    <td className="py-2 text-right font-mono-num">{formatMMK(it.unitCost, '')}</td>
                    <td className="py-2 text-right font-mono-num font-semibold">{formatMMK(it.lineTotal, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};
