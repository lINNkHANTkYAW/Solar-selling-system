import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, getYangonTodayClient } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

export const WarrantyView: React.FC = () => {
  const { t, lang, notify } = useApp();
  const [warranties, setWarranties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [regOpen, setRegOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    serialNumber: '',
    productId: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    invoiceNumber: '',
    saleDate: getYangonTodayClient(),
    warrantyMonths: '12',
    notes: '',
  });

  const [claimTarget, setClaimTarget] = useState<any | null>(null);
  const [claimForm, setClaimForm] = useState({
    issueDescription: '',
    status: 'open',
    resolutionNotes: '',
    replacementSerial: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wars, prods, custs] = await Promise.all([
        apiRequest<any[]>('/api/warranties'),
        apiRequest<any[]>('/api/products'),
        apiRequest<any[]>('/api/customers'),
      ]);
      setWarranties(wars);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cust = customers.find((c) => c.id === regForm.customerId);
      await apiRequest('/api/warranties', {
        method: 'POST',
        body: {
          ...regForm,
          customerName: cust?.name || regForm.customerName,
          customerPhone: cust?.phone || regForm.customerPhone,
        },
      });
      notify('success', 'Serial warranty registered.');
      setRegOpen(false);
      await loadData();
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleLogClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimTarget) return;
    try {
      await apiRequest(`/api/warranties/${claimTarget.id}/claims`, {
        method: 'POST',
        body: claimForm,
      });
      notify('success', 'Warranty claim logged.');
      setClaimTarget(null);
      setClaimForm({ issueDescription: '', status: 'open', resolutionNotes: '', replacementSerial: '' });
      await loadData();
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const filtered = warranties.filter((w) => statusFilter === 'all' || w.status === statusFilter);

  const columns: ColumnDef<any>[] = [
    {
      key: 'serialNumber',
      header: 'Serial Number',
      sortable: true,
      sortValue: (r) => r.serialNumber,
      render: (r) => <span className="font-mono-num font-bold text-[#14243A]">{r.serialNumber}</span>,
    },
    {
      key: 'productName',
      header: 'Product',
      render: (r) => <span className="text-xs font-medium">{r.productName}</span>,
    },
    {
      key: 'customerName',
      header: 'Customer & Phone',
      render: (r) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800">{r.customerName || 'Walk-in'}</div>
          <div className="text-slate-500">{r.customerPhone}</div>
        </div>
      ),
    },
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (r) => <span className="font-mono-num text-xs text-blue-700">{r.invoiceNumber || '—'}</span>,
    },
    {
      key: 'warrantyEndDate',
      header: 'Valid Period',
      sortable: true,
      sortValue: (r) => r.warrantyEndDate,
      render: (r) => (
        <span className="font-mono-num text-xs text-slate-600">
          {formatDateDDMMYYYY(r.warrantyStartDate)} → <strong>{formatDateDDMMYYYY(r.warrantyEndDate)}</strong> (
          {r.warrantyMonths}m)
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
      header: 'Claims',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={() => setClaimTarget(r)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#14243A] bg-slate-100 hover:bg-slate-200 rounded"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Claim ({(r.claims || []).length})</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_warranty')}
        subtitle={
          lang === 'my'
            ? 'စီရီရယ်နံပါတ်၊ ဘောက်ချာနံပါတ်၊ ဖုန်းနံပါတ်ဖြင့် အာမခံရှာဖွေခြင်းနှင့် အာမခံပြင်ဆင်/အစားထိုးမှတ်တမ်းများ'
            : 'Lookup warranties by Serial Number, Invoice Number, or Customer Phone and manage warranty claims'
        }
        actions={
          <button
            type="button"
            onClick={() => setRegOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Register Serial Warranty</span>
          </button>
        }
      />

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search by Serial Number, Invoice #, Customer Phone, or Product..."
        searchFilter={(r, q) =>
          r.serialNumber.toLowerCase().includes(q) ||
          (r.invoiceNumber || '').toLowerCase().includes(q) ||
          (r.customerPhone || '').toLowerCase().includes(q) ||
          (r.customerName || '').toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q)
        }
        toolbarExtra={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="all">All Warranty Status</option>
            <option value="active">Active</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
            <option value="under_claim">Under Claim</option>
            <option value="replaced">Replaced</option>
          </select>
        }
      />

      <Modal open={regOpen} onClose={() => setRegOpen(false)} title="Register Serial Number Warranty" size="lg">
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Serial Number *</label>
              <input
                required
                value={regForm.serialNumber}
                onChange={(e) => setRegForm({ ...regForm, serialNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Product *</label>
              <select
                required
                value={regForm.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setRegForm({
                    ...regForm,
                    productId: e.target.value,
                    warrantyMonths: String(p?.warrantyMonths || 12),
                  });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select Product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.warrantyMonths}m)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
              <select
                value={regForm.customerId}
                onChange={(e) => setRegForm({ ...regForm, customerId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select or type below</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Number</label>
              <input
                value={regForm.invoiceNumber}
                onChange={(e) => setRegForm({ ...regForm, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sale / Start Date</label>
              <input
                type="date"
                value={regForm.saleDate}
                onChange={(e) => setRegForm({ ...regForm, saleDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Warranty Months</label>
              <input
                type="number"
                min="1"
                value={regForm.warrantyMonths}
                onChange={(e) => setRegForm({ ...regForm, warrantyMonths: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRegOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Save Warranty
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(claimTarget)}
        onClose={() => setClaimTarget(null)}
        title={`Warranty Claims — S/N ${claimTarget?.serialNumber || ''}`}
        subtitle={`${claimTarget?.productName || ''} · ${claimTarget?.customerName || ''}`}
        size="lg"
      >
        {claimTarget && (
          <div className="space-y-5">
            {(claimTarget.claims || []).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#14243A]">Previous Claims</h4>
                {claimTarget.claims.map((c: any) => (
                  <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{formatDateDDMMYYYY(c.claimDate)}</span>
                      <span className="uppercase text-blue-700">{c.status}</span>
                    </div>
                    <p className="text-slate-700 mt-1">{c.issueDescription}</p>
                    {c.resolutionNotes && <p className="text-slate-500 mt-0.5">Resolution: {c.resolutionNotes}</p>}
                    {c.replacementSerial && (
                      <p className="font-mono-num text-emerald-700 mt-0.5">Replacement S/N: {c.replacementSerial}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleLogClaim} className="space-y-3 pt-3 border-t border-slate-200">
              <h4 className="text-xs font-bold text-[#14243A]">Log New Claim / Replacement</h4>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reported Fault / Issue *</label>
                <textarea
                  required
                  rows={2}
                  value={claimForm.issueDescription}
                  onChange={(e) => setClaimForm({ ...claimForm, issueDescription: e.target.value })}
                  placeholder="e.g. Inverter MPPT channel 2 error code F18"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Claim Status</label>
                  <select
                    value={claimForm.status}
                    onChange={(e) => setClaimForm({ ...claimForm, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="open">Open</option>
                    <option value="inspecting">Inspecting</option>
                    <option value="approved">Approved</option>
                    <option value="replaced">Replaced</option>
                    <option value="rejected">Rejected</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Replacement Serial (if replaced)</label>
                  <input
                    value={claimForm.replacementSerial}
                    onChange={(e) => setClaimForm({ ...claimForm, replacementSerial: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Technician Resolution Notes</label>
                <input
                  value={claimForm.resolutionNotes}
                  onChange={(e) => setClaimForm({ ...claimForm, resolutionNotes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setClaimTarget(null)} className="px-4 py-2 text-sm border rounded-lg">
                  Close
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
                  Save Claim
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};
