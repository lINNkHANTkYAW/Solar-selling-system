import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ArrowRightCircle, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

interface LineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export const QuotationsPackagesView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify, quickActionIntent, clearQuickActionIntent } =
    useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [tab, setTab] = useState<'quotations' | 'packages'>('quotations');
  const [quotations, setQuotations] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Package Modal
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgForm, setPkgForm] = useState({
    name: '',
    burmeseName: '',
    systemCapacityKw: '5',
    description: '',
    installationCharge: '450000',
    transportCharge: '100000',
    discountAmount: '0',
  });
  const [pkgLines, setPkgLines] = useState<LineItem[]>([{ productId: '', quantity: 1, unitPrice: 0 }]);

  // Create Quotation Modal
  const [qtnOpen, setQtnOpen] = useState(false);
  const [qtnForm, setQtnForm] = useState({
    customerId: '',
    customerName: '',
    packageId: '',
    installationCharge: '0',
    transportCharge: '0',
    discountAmount: '0',
    notes: '',
  });
  const [qtnLines, setQtnLines] = useState<LineItem[]>([{ productId: '', quantity: 1, unitPrice: 0 }]);

  // Convert Quotation to Sale Modal
  const [convertTarget, setConvertTarget] = useState<any | null>(null);
  const [convertForm, setConvertForm] = useState({ paymentMethod: 'Cash', paidAmount: '', accountId: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [qtns, pkgs, prods, custs] = await Promise.all([
        apiRequest<any[]>('/api/quotations'),
        apiRequest<any[]>('/api/packages'),
        apiRequest<any[]>('/api/products'),
        apiRequest<any[]>('/api/customers'),
      ]);
      setQuotations(qtns);
      setPackages(pkgs);
      setProducts(prods);
      setCustomers(custs);
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
    if (quickActionIntent === 'new_quotation') {
      setTab('quotations');
      setQtnOpen(true);
      clearQuickActionIntent();
    }
  }, [quickActionIntent, clearQuickActionIntent]);

  const applyPackageToQuotation = (packageId: string) => {
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;
    setQtnForm((f) => ({
      ...f,
      packageId,
      installationCharge: String(Number(pkg.installationCharge)),
      transportCharge: String(Number(pkg.transportCharge)),
      discountAmount: String(Number(pkg.discountAmount)),
    }));
    setQtnLines(
      (pkg.items || []).map((i: any) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
      }))
    );
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = pkgLines.filter((l) => l.productId && l.quantity > 0);
    if (!pkgForm.name || valid.length === 0) {
      notify('error', 'Enter package name and at least one solar component.');
      return;
    }
    try {
      await apiRequest('/api/packages', {
        method: 'POST',
        body: { ...pkgForm, items: valid },
      });
      notify('success', 'Solar system package saved.');
      setPkgOpen(false);
      await loadData();
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = qtnLines.filter((l) => l.productId && l.quantity > 0);
    if (valid.length === 0) {
      notify('error', 'Add at least one item to quotation.');
      return;
    }
    try {
      await apiRequest('/api/quotations', {
        method: 'POST',
        body: { ...qtnForm, items: valid },
      });
      notify('success', 'Quotation generated (inventory NOT reduced until converted to confirmed sale).');
      setQtnOpen(false);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertTarget) return;
    try {
      const sale = await apiRequest(`/api/quotations/${convertTarget.id}/convert`, {
        method: 'POST',
        body: {
          paymentMethod: convertForm.paymentMethod,
          paidAmount: Number(convertForm.paidAmount || 0),
          accountId: convertForm.accountId || bootstrap?.accounts?.[0]?.id,
        },
      });
      notify('success', `Converted to Sale Invoice ${sale.invoiceNumber} — inventory updated atomically.`);
      setConvertTarget(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const qtnCols: ColumnDef<any>[] = [
    {
      key: 'quotationNumber',
      header: 'Quotation #',
      sortable: true,
      sortValue: (r) => r.quotationNumber,
      render: (r) => <span className="font-mono-num font-semibold text-blue-700">{r.quotationNumber}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (r) => <span className="font-medium text-[#14243A]">{r.customerName}</span>,
    },
    {
      key: 'quotationDate',
      header: 'Date / Valid Until',
      render: (r) => (
        <span className="font-mono-num text-xs text-slate-600">
          {formatDateDDMMYYYY(r.quotationDate)} → {formatDateDDMMYYYY(r.validUntil)}
        </span>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Quoted Total',
      align: 'right',
      render: (r) => <span className="font-mono-num font-bold">{formatMMK(r.grandTotal, currency)}</span>,
    },
    {
      key: 'estimatedProfit',
      header: 'Est. Gross Profit',
      align: 'right',
      render: (r) => (
        <span className="font-mono-num text-xs text-emerald-700 font-semibold">
          {formatMMK(r.estimatedProfit, currency)}
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
          {r.status !== 'converted' && (
            <>
              <select
                value={r.status}
                onChange={async (e) => {
                  await apiRequest(`/api/quotations/${r.id}/status`, {
                    method: 'PATCH',
                    body: { status: e.target.value },
                  });
                  await loadData();
                }}
                className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setConvertTarget(r);
                  setConvertForm({
                    paymentMethod: 'Cash',
                    paidAmount: String(Math.round(Number(r.grandTotal))),
                    accountId: bootstrap?.accounts?.[0]?.id || '',
                  });
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" />
                <span>Convert to Sale</span>
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_quotations')}
        subtitle={
          lang === 'my'
            ? 'ဆိုလာစနစ် ပက်ကေ့ချ်တည်ဆောက်ခြင်း (ဥပမာ 5kW စနစ်) နှင့် ဖောက်သည်ဈေးနှုန်းလွှာများ (အရောင်းပြောင်းလဲမှသာ စတော့လျော့မည်)'
            : 'Complete solar system package builder and customer quotations (quotations never deduct inventory until converted)'
        }
        actions={
          <>
            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
              <button
                type="button"
                onClick={() => setTab('quotations')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'quotations' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                Quotations ({quotations.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('packages')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'packages' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                Solar Packages ({packages.length})
              </button>
            </div>
            <button
              type="button"
              onClick={() => (tab === 'packages' ? setPkgOpen(true) : setQtnOpen(true))}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>{tab === 'packages' ? 'New Solar Package' : 'Create Quotation'}</span>
            </button>
          </>
        }
      />

      {tab === 'quotations' ? (
        <DataTable
          data={quotations}
          columns={qtnCols}
          loading={loading}
          searchPlaceholder="Search quotation #, customer..."
          searchFilter={(r, q) =>
            r.quotationNumber.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q)
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No solar packages created yet. Click "New Solar Package" to build a 3kW / 5kW / 10kW system bundle.
            </div>
          ) : (
            packages.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono-num font-semibold text-amber-700 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      {Number(pkg.systemCapacityKw)} kW System
                    </span>
                    <span className="font-mono-num">{pkg.code}</span>
                  </div>
                  <h3 className="text-base font-bold text-[#14243A] mt-1">{pkg.name}</h3>
                  {pkg.burmeseName && <p className="text-xs text-slate-500 mt-0.5">{pkg.burmeseName}</p>}

                  <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    {(pkg.items || []).map((i: any, idx: number) => (
                      <li key={idx} className="flex justify-between">
                        <span className="truncate pr-2">{i.productName}</span>
                        <span className="font-mono-num font-semibold shrink-0">× {Number(i.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Estimated Cost</span>
                    <span className="font-mono-num">{formatMMK(pkg.totalCost, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-[#14243A]">
                    <span>Package Price</span>
                    <span className="font-mono-num">{formatMMK(pkg.sellingPrice, currency)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Estimated Profit</span>
                    <span className="font-mono-num">{formatMMK(pkg.estimatedProfit, currency)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      applyPackageToQuotation(pkg.id);
                      setTab('quotations');
                      setQtnOpen(true);
                    }}
                    className="w-full mt-3 py-2 text-xs font-semibold text-[#14243A] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Generate Quotation From Package
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Solar Package Modal */}
      <Modal open={pkgOpen} onClose={() => setPkgOpen(false)} title="Solar System Package Builder" size="xl">
        <form onSubmit={handleCreatePackage} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Package Name *</label>
              <input
                required
                placeholder="e.g. 5kW Hybrid Home Solar System"
                value={pkgForm.name}
                onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">System Size (kW)</label>
              <input
                type="number"
                step="0.5"
                value={pkgForm.systemCapacityKw}
                onChange={(e) => setPkgForm({ ...pkgForm, systemCapacityKw: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[#14243A]">Package Components</span>
              <button
                type="button"
                onClick={() => setPkgLines([...pkgLines, { productId: '', quantity: 1, unitPrice: 0 }])}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + Add Component
              </button>
            </div>
            {pkgLines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={l.productId}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === e.target.value);
                    setPkgLines((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, productId: e.target.value, unitPrice: Number(p?.sellingPrice || 0) } : row
                      )
                    );
                  }}
                  className="col-span-6 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Solar Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={l.quantity}
                  onChange={(e) =>
                    setPkgLines((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, quantity: Number(e.target.value || 1) } : row))
                    )
                  }
                  className="col-span-2 px-2 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  value={l.unitPrice}
                  onChange={(e) =>
                    setPkgLines((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, unitPrice: Number(e.target.value || 0) } : row))
                    )
                  }
                  className="col-span-3 px-2 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setPkgLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-slate-400 hover:text-red-600 flex justify-end"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Installation Charge</label>
              <input
                type="number"
                value={pkgForm.installationCharge}
                onChange={(e) => setPkgForm({ ...pkgForm, installationCharge: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transport Charge</label>
              <input
                type="number"
                value={pkgForm.transportCharge}
                onChange={(e) => setPkgForm({ ...pkgForm, transportCharge: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Package Discount</label>
              <input
                type="number"
                value={pkgForm.discountAmount}
                onChange={(e) => setPkgForm({ ...pkgForm, discountAmount: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPkgOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Save Package
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Quotation Modal */}
      <Modal
        open={qtnOpen}
        onClose={() => setQtnOpen(false)}
        title="Generate Customer Quotation"
        subtitle="Does not reserve or reduce inventory until approved and converted to a confirmed sale."
        size="xl"
      >
        <form onSubmit={handleCreateQuotation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
              <select
                value={qtnForm.customerId}
                onChange={(e) => setQtnForm({ ...qtnForm, customerId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Prospective / New Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Load Solar Package Template</label>
              <select
                value={qtnForm.packageId}
                onChange={(e) => applyPackageToQuotation(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Custom Quotation Items</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatMMK(p.sellingPrice, currency)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!qtnForm.customerId && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Prospect Customer Name *</label>
              <input
                required
                value={qtnForm.customerName}
                onChange={(e) => setQtnForm({ ...qtnForm, customerName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs font-bold text-[#14243A]">Quoted Items</span>
              <button
                type="button"
                onClick={() => setQtnLines([...qtnLines, { productId: '', quantity: 1, unitPrice: 0 }])}
                className="text-xs font-semibold text-blue-600"
              >
                + Add Line
              </button>
            </div>
            {qtnLines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={l.productId}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === e.target.value);
                    setQtnLines((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, productId: e.target.value, unitPrice: Number(p?.sellingPrice || 0) } : row
                      )
                    );
                  }}
                  className="col-span-6 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={l.quantity}
                  onChange={(e) =>
                    setQtnLines((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, quantity: Number(e.target.value || 1) } : row))
                    )
                  }
                  className="col-span-2 px-2 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  min="0"
                  value={l.unitPrice}
                  onChange={(e) =>
                    setQtnLines((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, unitPrice: Number(e.target.value || 0) } : row))
                    )
                  }
                  className="col-span-3 px-2 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setQtnLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 text-slate-400 hover:text-red-600 flex justify-end"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Installation</label>
              <input
                type="number"
                value={qtnForm.installationCharge}
                onChange={(e) => setQtnForm({ ...qtnForm, installationCharge: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transport</label>
              <input
                type="number"
                value={qtnForm.transportCharge}
                onChange={(e) => setQtnForm({ ...qtnForm, transportCharge: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Discount</label>
              <input
                type="number"
                value={qtnForm.discountAmount}
                onChange={(e) => setQtnForm({ ...qtnForm, discountAmount: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setQtnOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Create Quotation
            </button>
          </div>
        </form>
      </Modal>

      {/* Convert Quotation to Sale Modal */}
      <Modal
        open={Boolean(convertTarget)}
        onClose={() => setConvertTarget(null)}
        title={`Convert Quotation to Sale — ${convertTarget?.quotationNumber || ''}`}
        subtitle="Atomically creates a Sales Invoice, deducts stock, snapshots COGS, and updates accounts."
        size="md"
      >
        <form onSubmit={handleConvert} className="space-y-4">
          <div className="text-xs text-slate-600">
            Grand Total:{' '}
            <strong className="font-mono-num text-[#14243A]">
              {formatMMK(convertTarget?.grandTotal, currency)}
            </strong>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={convertForm.paymentMethod}
                onChange={(e) => setConvertForm({ ...convertForm, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="KBZPay">KBZPay</option>
                <option value="WavePay">WavePay</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit">Credit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deposit Account</label>
              <select
                value={convertForm.accountId}
                onChange={(e) => setConvertForm({ ...convertForm, accountId: e.target.value })}
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Amount Paid</label>
            <input
              type="number"
              min="0"
              value={convertForm.paidAmount}
              onChange={(e) => setConvertForm({ ...convertForm, paidAmount: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConvertTarget(null)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg">
              Confirm & Convert to Sale
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
