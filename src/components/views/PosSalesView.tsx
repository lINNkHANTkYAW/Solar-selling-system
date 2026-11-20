import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CreditCard,
  RotateCcw,
  Ban,
  UserPlus,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK, getYangonTodayClient } from '../../lib/i18n';
import {
  DataTable,
  Modal,
  PageHeader,
  ProductThumbnail,
  StatusText,
  type ColumnDef,
} from '../ui/CommonUI';
import { ReceiptModal } from '../ReceiptModal';

interface CartItem {
  productId: string;
  sku: string;
  name: string;
  burmeseName: string;
  unit: string;
  stock: number;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  trackSerial: boolean;
  serialNumbers: string;
}

const PAYMENT_METHODS = ['Cash', 'KBZPay', 'WavePay', 'Bank Transfer', 'Credit', 'Other'];

export const PosSalesView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify, quickActionIntent, clearQuickActionIntent } =
    useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';
  const settings = bootstrap?.settings || {};

  const [subTab, setSubTab] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // POS State
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [overallDiscount, setOverallDiscount] = useState('0');
  const [additionalCharges, setAdditionalCharges] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [accountId, setAccountId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [receiptSale, setReceiptSale] = useState<any | null>(null);
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [quickCust, setQuickCust] = useState({ name: '', phone: '', township: '', customerType: 'retail' });

  // Sales History Action Modals
  const [detailSale, setDetailSale] = useState<any | null>(null);
  const [collectSale, setCollectSale] = useState<any | null>(null);
  const [collectForm, setCollectForm] = useState({ amount: '', paymentMethod: 'Cash', accountId: '', note: '' });
  const [returnSale, setReturnSale] = useState<any | null>(null);
  const [returnForm, setReturnForm] = useState({
    saleItemId: '',
    quantity: '1',
    restockType: 'restock',
    refundAccountId: '',
    reason: '',
  });
  const [cancelSale, setCancelSale] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, custs, sls] = await Promise.all([
        apiRequest<any[]>('/api/products'),
        apiRequest<any[]>('/api/customers'),
        apiRequest<any[]>('/api/sales'),
      ]);
      setProducts(prods);
      setCustomers(custs);
      setSalesList(sls);
    } catch (error: any) {
      notify('error', error.message || 'Failed to load POS data.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (quickActionIntent === 'new_sale') {
      setSubTab('pos');
      clearQuickActionIntent();
    }
  }, [quickActionIntent, clearQuickActionIntent]);

  useEffect(() => {
    if (bootstrap?.accounts?.length && !accountId) {
      const def = bootstrap.accounts.find((a) => a.accountType === 'cash') || bootstrap.accounts[0];
      if (def) setAccountId(def.id);
    }
  }, [bootstrap, accountId]);

  // Auto-select matching financial account when payment method switches
  useEffect(() => {
    const accs = bootstrap?.accounts || [];
    if (!accs.length) return;
    const typeMap: Record<string, string> = {
      Cash: 'cash',
      KBZPay: 'kbzpay',
      WavePay: 'wavepay',
      'Bank Transfer': 'bank',
    };
    const match = accs.find((a) => a.accountType === typeMap[paymentMethod]);
    if (match) setAccountId(match.id);
  }, [paymentMethod, bootstrap]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.burmeseName || '').toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, selectedCategory]);

  const addToCart = (prod: any) => {
    const price =
      selectedCustomer?.priceTier === 'wholesale' && Number(prod.wholesalePrice) > 0
        ? Number(prod.wholesalePrice)
        : Number(prod.sellingPrice);

    setCart((prev) => {
      const existing = prev.find((c) => c.productId === prod.id);
      if (existing) {
        return prev.map((c) =>
          c.productId === prod.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          burmeseName: prod.burmeseName,
          unit: prod.unit,
          stock: Number(prod.currentStock),
          unitPrice: price,
          quantity: 1,
          discountAmount: 0,
          trackSerial: Boolean(prod.trackSerial),
          serialNumbers: '',
        },
      ];
    });
  };

  // Barcode scan / Enter to add exact SKU or Barcode
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      const q = search.trim().toLowerCase();
      const exact = products.find(
        (p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q
      );
      if (exact) {
        addToCart(exact);
        setSearch('');
        notify('info', `Added ${exact.name} to cart`);
      }
    }
  };

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart]
  );
  const itemDiscountTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0),
    [cart]
  );
  const overallDiscNum = Math.max(0, Number(overallDiscount || 0));
  const addChargesNum = Math.max(0, Number(additionalCharges || 0));
  const netBeforeTax = Math.max(0, subtotal - itemDiscountTotal - overallDiscNum + addChargesNum);
  const taxAmount = settings.taxEnabled ? (netBeforeTax * Number(settings.taxRate || 0)) / 100 : 0;
  const grandTotal = Math.round(netBeforeTax + taxAmount);

  const effectivePaid =
    paymentMethod === 'Credit'
      ? 0
      : paidAmount === ''
        ? grandTotal
        : Math.max(0, Math.min(grandTotal, Number(paidAmount)));
  const remainingBalance = Math.max(0, grandTotal - effectivePaid);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      notify('error', 'Add at least one solar product to the cart.');
      return;
    }
    if (remainingBalance > 0 && !selectedCustomerId) {
      notify(
        'error',
        lang === 'my'
          ? 'အကြွေး (သို့) တစ်စိတ်တစ်ပိုင်း ငွေရှင်းရန် ဖောက်သည်အမည် ရွေးချယ်ပါ။'
          : 'Please select a registered customer for Credit or Partial Payment sales.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiRequest('/api/sales', {
        method: 'POST',
        body: {
          customerId: selectedCustomerId || null,
          saleDate: getYangonTodayClient(),
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            discountAmount: c.discountAmount,
            serialNumbers: c.serialNumbers,
          })),
          overallDiscount: overallDiscNum,
          additionalCharges: addChargesNum,
          paymentMethod,
          accountId,
          paidAmount: effectivePaid,
          notes,
          idempotencyKey: `POS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        },
      });
      notify('success', `Invoice ${created.invoiceNumber} confirmed and inventory updated.`);
      setReceiptSale(created);
      setCart([]);
      setOverallDiscount('0');
      setAdditionalCharges('0');
      setPaidAmount('');
      setNotes('');
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message || 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCust.name.trim()) return;
    try {
      const created = await apiRequest('/api/customers', {
        method: 'POST',
        body: quickCust,
      });
      setCustomers((prev) => [created, ...prev]);
      setSelectedCustomerId(created.id);
      setQuickCustOpen(false);
      setQuickCust({ name: '', phone: '', township: '', customerType: 'retail' });
      notify('success', `Customer ${created.name} registered.`);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const openSaleDetail = async (id: string) => {
    try {
      const full = await apiRequest(`/api/sales/${id}`);
      setDetailSale(full);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleCollectDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectSale) return;
    try {
      await apiRequest(`/api/sales/${collectSale.id}/collect`, {
        method: 'POST',
        body: {
          amount: Number(collectForm.amount),
          paymentMethod: collectForm.paymentMethod,
          accountId: collectForm.accountId || accountId,
          referenceNote: collectForm.note,
          idempotencyKey: `COL-${collectSale.id}-${Date.now()}`,
        },
      });
      notify('success', 'Customer debt collection recorded cleanly (Receivable reduced).');
      setCollectSale(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleSalesReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnSale) return;
    try {
      await apiRequest(`/api/sales/${returnSale.id}/return`, {
        method: 'POST',
        body: {
          saleItemId: returnForm.saleItemId,
          quantity: Number(returnForm.quantity),
          restockType: returnForm.restockType,
          refundAccountId: returnForm.refundAccountId || accountId,
          reason: returnForm.reason,
        },
      });
      notify('success', 'Sales return processed and stock/balance adjusted.');
      setReturnSale(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleCancelSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelSale) return;
    try {
      await apiRequest(`/api/sales/${cancelSale.id}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason },
      });
      notify('success', `Invoice ${cancelSale.invoiceNumber} cancelled and reversed.`);
      setCancelSale(null);
      setCancelReason('');
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const salesColumns: ColumnDef<any>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      sortable: true,
      sortValue: (r) => r.invoiceNumber,
      render: (r) => (
        <button
          type="button"
          onClick={() => openSaleDetail(r.id)}
          className="font-mono-num font-semibold text-blue-700 hover:underline"
        >
          {r.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'saleDate',
      header: 'Date',
      sortable: true,
      sortValue: (r) => r.saleDate,
      render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.saleDate)}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      sortValue: (r) => r.customerName,
      render: (r) => <span className="font-medium text-slate-800">{r.customerName}</span>,
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: (r) => <span className="text-xs text-slate-600">{r.paymentMethod}</span>,
    },
    {
      key: 'grandTotal',
      header: 'Total',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.grandTotal),
      render: (r) => <span className="font-mono-num font-semibold">{formatMMK(r.grandTotal, currency)}</span>,
    },
    {
      key: 'outstandingAmount',
      header: 'Balance Due',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.outstandingAmount),
      render: (r) => (
        <span
          className={`font-mono-num font-semibold ${
            Number(r.outstandingAmount) > 0 ? 'text-red-700' : 'text-slate-400'
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
          <button
            type="button"
            onClick={() => setReceiptSale(r)}
            title="Print Receipt"
            className="p-1.5 text-slate-600 hover:text-[#14243A] hover:bg-slate-100 rounded"
          >
            <Printer className="w-4 h-4" />
          </button>
          {Number(r.outstandingAmount) > 0 && r.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => {
                setCollectSale(r);
                setCollectForm({
                  amount: String(Number(r.outstandingAmount)),
                  paymentMethod: 'Cash',
                  accountId: accountId,
                  note: '',
                });
              }}
              title="Collect Debt"
              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
            >
              <CreditCard className="w-4 h-4" />
            </button>
          )}
          {r.status !== 'cancelled' && (r.items || []).length > 0 && (
            <button
              type="button"
              onClick={() => {
                setReturnSale(r);
                setReturnForm({
                  saleItemId: r.items[0]?.id || '',
                  quantity: '1',
                  restockType: 'restock',
                  refundAccountId: accountId,
                  reason: '',
                });
              }}
              title="Sales Return"
              className="p-1.5 text-amber-700 hover:bg-amber-50 rounded"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {r.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => setCancelSale(r)}
              title="Cancel Invoice"
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
            >
              <Ban className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_pos')}
        subtitle={
          lang === 'my'
            ? 'မြန်ဆန်သော POS အရောင်းကောင်တာ၊ ဘောက်ချာပရင့်ထုတ်ခြင်း၊ အကြွေးကောက်ခံခြင်းနှင့် ပစ္စည်းပြန်အပ်မှုများ'
            : 'Fast solar checkout POS terminal, A4/thermal receipts, credit sales, debt collection, and returns'
        }
        actions={
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('pos')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                subTab === 'pos' ? 'bg-[#14243A] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('pos_terminal')}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                subTab === 'history' ? 'bg-[#14243A] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('sales_history')} ({salesList.length})
            </button>
          </div>
        }
      />

      {subTab === 'pos' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left: Product Picker (7 cols) */}
          <div className="xl:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={
                    lang === 'my'
                      ? 'ပစ္စည်းအမည်၊ SKU သို့မဟုတ် Barcode စကန်ဖတ်၍ Enter နှိပ်ပါ...'
                      : 'Search product name, SKU, or scan barcode & press Enter...'
                  }
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-[#14243A] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({products.length})
                </button>
                {(bootstrap?.categories || []).map((cat: any) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-[#14243A] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {lang === 'my' && cat.burmeseName ? cat.burmeseName : cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 h-44 animate-pulse" />
                ))
              ) : filteredProducts.length === 0 ? (
                <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  No solar products match your filter. Add products in Inventory first.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const out = Number(p.currentStock) <= 0 && !settings.allowNegativeStock;
                  const displayPrice =
                    selectedCustomer?.priceTier === 'wholesale' && Number(p.wholesalePrice) > 0
                      ? p.wholesalePrice
                      : p.sellingPrice;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => addToCart(p)}
                      className="text-left bg-white border border-slate-200 hover:border-blue-500 rounded-xl p-3 flex flex-col justify-between transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div>
                        <ProductThumbnail src={p.imageUrl} alt={p.name} size="lg" />
                        <div className="mt-2.5 font-semibold text-xs text-[#14243A] line-clamp-2 leading-snug">
                          {p.name}
                        </div>
                        {p.burmeseName && p.burmeseName !== p.name && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{p.burmeseName}</div>
                        )}
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-end justify-between gap-2">
                        <div>
                          <div className="font-mono-num text-sm font-bold text-blue-700">
                            {formatMMK(displayPrice, '')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono-num">{p.sku}</div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-xs font-mono-num font-semibold ${
                              Number(p.currentStock) <= p.minStockLevel ? 'text-red-700' : 'text-emerald-700'
                            }`}
                          >
                            {Number(p.currentStock)} {p.unit}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Live POS Cart & Checkout (5 cols) */}
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-20">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#F59E0B]" />
                <h2 className="text-sm font-bold text-[#14243A]">
                  {lang === 'my' ? 'လက်ရှိ အရောင်းခြင်းတောင်း' : 'Current Sale Cart'} ({cart.length})
                </h2>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Customer Selection */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="">Walk-in Customer (Retail Price)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.priceTier === 'wholesale' ? 'Wholesale' : 'Retail'}) — {c.phone}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setQuickCustOpen(true)}
                title="Quick Add Customer"
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">{t('cart_empty')}</div>
              ) : (
                cart.map((item) => (
                  <div key={item.productId} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#14243A] leading-snug">{item.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {formatMMK(item.unitPrice, currency)} / {item.unit} · Stock: {item.stock}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCart((p) => p.filter((x) => x.productId !== item.productId))}
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === item.productId
                                  ? { ...x, quantity: Math.max(1, x.quantity - 1) }
                                  : x
                              )
                            )
                          }
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === item.productId
                                  ? { ...x, quantity: Math.max(1, Number(e.target.value || 1)) }
                                  : x
                              )
                            )
                          }
                          className="w-14 text-center py-1 text-xs font-mono-num border border-slate-200 rounded"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === item.productId ? { ...x, quantity: x.quantity + 1 } : x
                              )
                            )
                          }
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder="Disc"
                          value={item.discountAmount || ''}
                          onChange={(e) =>
                            setCart((p) =>
                              p.map((x) =>
                                x.productId === item.productId
                                  ? { ...x, discountAmount: Math.max(0, Number(e.target.value || 0)) }
                                  : x
                              )
                            )
                          }
                          className="w-20 px-2 py-1 text-xs font-mono-num border border-slate-200 rounded text-right"
                          title="Item Discount (MMK)"
                        />
                        <span className="font-mono-num text-xs font-bold text-[#14243A] w-24 text-right">
                          {formatMMK(item.quantity * item.unitPrice - item.discountAmount, '')}
                        </span>
                      </div>
                    </div>

                    {item.trackSerial && (
                      <input
                        type="text"
                        value={item.serialNumbers}
                        onChange={(e) =>
                          setCart((p) =>
                            p.map((x) =>
                              x.productId === item.productId ? { ...x, serialNumbers: e.target.value } : x
                            )
                          )
                        }
                        placeholder="Serial numbers (comma separated for warranty auto-registration)"
                        className="w-full px-2.5 py-1 text-[11px] font-mono-num border border-slate-200 rounded bg-slate-50"
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Pricing & Payment Section */}
            <div className="p-5 border-t border-slate-200 space-y-3 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('discount')} ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={overallDiscount}
                    onChange={(e) => setOverallDiscount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono-num bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('additional_charges')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={additionalCharges}
                    onChange={(e) => setAdditionalCharges(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono-num bg-white border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Deposit Account</label>
                  <select
                    value={accountId}
                    disabled={paymentMethod === 'Credit'}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg disabled:opacity-50"
                  >
                    {(bootstrap?.accounts || []).map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {paymentMethod !== 'Credit' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {t('paid_amount')} (Leave blank for full payment)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={String(grandTotal)}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num font-semibold bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {/* Totals Summary */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>{t('subtotal')}</span>
                  <span className="font-mono-num">{formatMMK(subtotal, currency)}</span>
                </div>
                {itemDiscountTotal + overallDiscNum > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Total Discount</span>
                    <span className="font-mono-num text-red-600">
                      -{formatMMK(itemDiscountTotal + overallDiscNum, currency)}
                    </span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax ({settings.taxRate}%)</span>
                    <span className="font-mono-num">{formatMMK(taxAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-[#14243A] pt-1.5 border-t border-slate-200">
                  <span>{t('grand_total')}</span>
                  <span className="font-mono-num">{formatMMK(grandTotal, currency)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>{t('paid_amount')}</span>
                  <span className="font-mono-num">{formatMMK(effectivePaid, currency)}</span>
                </div>
                {remainingBalance > 0 && (
                  <div className="flex justify-between text-red-700 font-bold">
                    <span>{t('remaining_balance')}</span>
                    <span className="font-mono-num">{formatMMK(remainingBalance, currency)}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={handleCheckout}
                className="w-full py-3 px-4 flex items-center justify-center gap-2 text-sm font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4.5 h-4.5" />
                <span>{submitting ? 'Processing Atomic Sale...' : t('confirm_sale')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <DataTable
          data={salesList}
          columns={salesColumns}
          loading={loading}
          searchPlaceholder="Search invoice #, customer, payment method..."
          searchFilter={(r, q) =>
            r.invoiceNumber.toLowerCase().includes(q) ||
            r.customerName.toLowerCase().includes(q) ||
            r.paymentMethod.toLowerCase().includes(q)
          }
        />
      )}

      {/* Printable Receipt Modal */}
      <ReceiptModal open={Boolean(receiptSale)} onClose={() => setReceiptSale(null)} sale={receiptSale} />

      {/* Quick Customer Modal */}
      <Modal
        open={quickCustOpen}
        onClose={() => setQuickCustOpen(false)}
        title="Register Customer"
        size="md"
      >
        <form onSubmit={handleQuickCreateCustomer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
            <input
              required
              value={quickCust.name}
              onChange={(e) => setQuickCust({ ...quickCust, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                value={quickCust.phone}
                onChange={(e) => setQuickCust({ ...quickCust, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Type</label>
              <select
                value={quickCust.customerType}
                onChange={(e) => setQuickCust({ ...quickCust, customerType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="retail">Retail Customer</option>
                <option value="wholesale">Wholesale Customer</option>
                <option value="installer">Installer / Contractor</option>
                <option value="corporate">Corporate Customer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Township</label>
            <input
              value={quickCust.township}
              onChange={(e) => setQuickCust({ ...quickCust, township: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setQuickCustOpen(false)}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              Save Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* Sale Detail Modal */}
      <Modal
        open={Boolean(detailSale)}
        onClose={() => setDetailSale(null)}
        title={`Invoice Details — ${detailSale?.invoiceNumber || ''}`}
        size="lg"
      >
        {detailSale && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
              <div>
                <div className="text-slate-500">Customer</div>
                <div className="font-semibold text-[#14243A] mt-0.5">{detailSale.customerName}</div>
              </div>
              <div>
                <div className="text-slate-500">Sale Date</div>
                <div className="font-mono-num font-semibold mt-0.5">{formatDateDDMMYYYY(detailSale.saleDate)}</div>
              </div>
              <div>
                <div className="text-slate-500">Total COGS</div>
                <div className="font-mono-num font-semibold mt-0.5">{formatMMK(detailSale.totalCogs, currency)}</div>
              </div>
              <div>
                <div className="text-slate-500">Gross Profit</div>
                <div className="font-mono-num font-semibold text-emerald-700 mt-0.5">
                  {formatMMK(detailSale.grossProfit, currency)}
                </div>
              </div>
            </div>

            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left">Product</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Returned</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Cost Snapshot</th>
                  <th className="py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(detailSale.items || []).map((it: any) => (
                  <tr key={it.id}>
                    <td className="py-2 font-medium">{it.productName}</td>
                    <td className="py-2 text-right font-mono-num">{Number(it.quantity)}</td>
                    <td className="py-2 text-right font-mono-num text-red-600">{Number(it.returnedQuantity)}</td>
                    <td className="py-2 text-right font-mono-num">{formatMMK(it.unitPrice, '')}</td>
                    <td className="py-2 text-right font-mono-num text-slate-500">
                      {formatMMK(it.unitCostSnapshot, '')}
                    </td>
                    <td className="py-2 text-right font-mono-num font-semibold">{formatMMK(it.lineTotal, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(detailSale.payments || []).length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <h4 className="text-xs font-bold text-[#14243A] mb-2">Payment History</h4>
                <div className="space-y-1.5 text-xs">
                  {detailSale.payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between py-1 border-b border-slate-100">
                      <span>
                        {formatDateDDMMYYYY(p.paymentDate)} · {p.paymentMethod}
                        {p.isDebtCollection ? ' (Debt Collection)' : ' (POS Payment)'}
                      </span>
                      <span className="font-mono-num font-semibold text-emerald-700">
                        {formatMMK(p.amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Debt Collection Modal */}
      <Modal
        open={Boolean(collectSale)}
        onClose={() => setCollectSale(null)}
        title={`Collect Customer Debt — ${collectSale?.invoiceNumber || ''}`}
        subtitle="Increases Cash/Bank balance and reduces customer receivable without creating duplicate revenue."
        size="md"
      >
        <form onSubmit={handleCollectDebt} className="space-y-4">
          <div className="text-xs text-slate-600">
            Remaining Balance:{' '}
            <strong className="font-mono-num text-red-700">
              {formatMMK(collectSale?.outstandingAmount, currency)}
            </strong>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Collected *</label>
            <input
              type="number"
              required
              min="1"
              max={Number(collectSale?.outstandingAmount || 0)}
              value={collectForm.amount}
              onChange={(e) => setCollectForm({ ...collectForm, amount: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={collectForm.paymentMethod}
                onChange={(e) => setCollectForm({ ...collectForm, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PAYMENT_METHODS.filter((m) => m !== 'Credit').map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Account</label>
              <select
                value={collectForm.accountId}
                onChange={(e) => setCollectForm({ ...collectForm, accountId: e.target.value })}
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference Note</label>
            <input
              value={collectForm.note}
              onChange={(e) => setCollectForm({ ...collectForm, note: e.target.value })}
              placeholder="e.g. KBZPay transfer ref"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCollectSale(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg">
              Record Debt Collection
            </button>
          </div>
        </form>
      </Modal>

      {/* Sales Return Modal */}
      <Modal
        open={Boolean(returnSale)}
        onClose={() => setReturnSale(null)}
        title={`Process Sales Return — ${returnSale?.invoiceNumber || ''}`}
        size="md"
      >
        <form onSubmit={handleSalesReturn} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Returned Product *</label>
            <select
              value={returnForm.saleItemId}
              onChange={(e) => setReturnForm({ ...returnForm, saleItemId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {(returnSale?.items || []).map((it: any) => (
                <option key={it.id} value={it.id}>
                  {it.productName} (Sold: {Number(it.quantity)}, Returned: {Number(it.returnedQuantity)})
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
                value={returnForm.quantity}
                onChange={(e) => setReturnForm({ ...returnForm, quantity: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Classification</label>
              <select
                value={returnForm.restockType}
                onChange={(e) => setReturnForm({ ...returnForm, restockType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="restock">Restock (Good Condition)</option>
                <option value="damaged">Damaged (Do Not Restock)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Refund Account</label>
            <select
              value={returnForm.refundAccountId}
              onChange={(e) => setReturnForm({ ...returnForm, refundAccountId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {(bootstrap?.accounts || []).map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Return Reason (Mandatory) *</label>
            <input
              required
              value={returnForm.reason}
              onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
              placeholder="e.g. Wrong inverter voltage selected by installer"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setReturnSale(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg">
              Confirm Return
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Sale Modal */}
      <Modal
        open={Boolean(cancelSale)}
        onClose={() => setCancelSale(null)}
        title={`Cancel & Reverse Invoice — ${cancelSale?.invoiceNumber || ''}`}
        subtitle="Finalized sales are reversed cleanly with stock restoration and audit logging."
        size="md"
      >
        <form onSubmit={handleCancelSale} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mandatory Cancellation Reason *
            </label>
            <textarea
              required
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Explain why this invoice is being reversed..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelSale(null)} className="px-4 py-2 text-sm border rounded-lg">
              Close
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg">
              Confirm Reversal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
