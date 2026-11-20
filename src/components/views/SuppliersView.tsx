import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Edit2, Eye } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

const EMPTY_SUP = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export const SuppliersView: React.FC = () => {
  const { t, lang, bootstrap, notify } = useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_SUP);
  const [profile, setProfile] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiRequest<any[]>('/api/suppliers');
      setSuppliers(rows);
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiRequest(`/api/suppliers/${editingId}`, { method: 'PUT', body: form });
        notify('success', 'Supplier updated.');
      } else {
        await apiRequest('/api/suppliers', { method: 'POST', body: form });
        notify('success', 'Supplier created.');
      }
      setFormOpen(false);
      await loadData();
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const openProfile = async (id: string) => {
    try {
      const data = await apiRequest(`/api/suppliers/${id}`);
      setProfile(data);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Supplier',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <button
            type="button"
            onClick={() => openProfile(r.id)}
            className="font-semibold text-[#14243A] hover:text-blue-700 text-left"
          >
            {r.name}
          </button>
          <div className="text-[11px] text-slate-500">
            {r.code} · {r.contactPerson || '—'} · {r.phone}
          </div>
        </div>
      ),
    },
    {
      key: 'totalPurchases',
      header: 'Total Procured',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.totalPurchases || 0),
      render: (r) => <span className="font-mono-num text-xs">{formatMMK(r.totalPurchases || 0, currency)}</span>,
    },
    {
      key: 'totalPayments',
      header: 'Total Paid',
      align: 'right',
      render: (r) => (
        <span className="font-mono-num text-xs text-emerald-700">{formatMMK(r.totalPayments || 0, '')}</span>
      ),
    },
    {
      key: 'payableBalance',
      header: 'Outstanding Payable',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.payableBalance),
      render: (r) => (
        <span
          className={`font-mono-num text-xs font-bold ${
            Number(r.payableBalance) > 0 ? 'text-amber-700' : 'text-slate-400'
          }`}
        >
          {formatMMK(r.payableBalance, currency)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openProfile(r.id)}
            className="p-1.5 text-blue-700 hover:bg-blue-50 rounded"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingId(r.id);
              setForm({
                name: r.name,
                contactPerson: r.contactPerson || '',
                phone: r.phone || '',
                email: r.email || '',
                address: r.address || '',
                notes: r.notes || '',
              });
              setFormOpen(true);
            }}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_suppliers')}
        subtitle={
          lang === 'my'
            ? 'ဆိုလာပစ္စည်း တင်သွင်းဖြန့်ဖြူးသူများနှင့် ပေးရန်ရှိငွေ (Payables) စာရင်း'
            : 'Solar equipment distributors, procurement ledger, and supplier payables tracking'
        }
        actions={
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY_SUP);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>
        }
      />

      <DataTable
        data={suppliers}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search supplier name, contact, phone..."
        searchFilter={(r, q) =>
          r.name.toLowerCase().includes(q) ||
          (r.contactPerson || '').toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q)
        }
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Supplier' : 'Add New Supplier'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
              <input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Save Supplier
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(profile)}
        onClose={() => setProfile(null)}
        title={profile?.supplier?.name || 'Supplier Profile'}
        subtitle={`${profile?.supplier?.contactPerson || ''} · ${profile?.supplier?.phone || ''}`}
        size="xl"
      >
        {profile && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Total Purchases</div>
                <div className="text-base font-bold font-mono-num text-[#14243A] mt-1">
                  {formatMMK(
                    profile.purchases.reduce((s: number, x: any) => s + Number(x.totalAmount), 0),
                    currency
                  )}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Total Paid</div>
                <div className="text-base font-bold font-mono-num text-emerald-700 mt-1">
                  {formatMMK(
                    profile.payments.reduce((s: number, x: any) => s + Number(x.amount), 0),
                    currency
                  )}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Outstanding Payable</div>
                <div className="text-base font-bold font-mono-num text-amber-700 mt-1">
                  {formatMMK(profile.supplier.payableBalance, currency)}
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Purchase #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Payable</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profile.purchases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                        No purchases yet
                      </td>
                    </tr>
                  ) : (
                    profile.purchases.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono-num font-semibold text-blue-700">{p.purchaseNumber}</td>
                        <td className="px-3 py-2 font-mono-num">{formatDateDDMMYYYY(p.purchaseDate)}</td>
                        <td className="px-3 py-2 text-right font-mono-num">{formatMMK(p.totalAmount, '')}</td>
                        <td className="px-3 py-2 text-right font-mono-num text-amber-700">
                          {formatMMK(p.outstandingAmount, '')}
                        </td>
                        <td className="px-3 py-2">
                          <StatusText status={p.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
