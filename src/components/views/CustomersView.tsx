import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Edit2, Eye } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK } from '../../lib/i18n';
import { DataTable, Modal, PageHeader, StatusText, type ColumnDef } from '../ui/CommonUI';

const EMPTY_CUST = {
  name: '',
  phone: '',
  secondaryPhone: '',
  township: '',
  address: '',
  customerType: 'retail',
  priceTier: 'retail',
  defaultDiscountPct: '0',
  notes: '',
};

export const CustomersView: React.FC = () => {
  const { t, lang, bootstrap, notify } = useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_CUST);
  const [profile, setProfile] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiRequest<any[]>('/api/customers');
      setCustomers(rows);
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
        await apiRequest(`/api/customers/${editingId}`, { method: 'PUT', body: form });
        notify('success', 'Customer updated.');
      } else {
        await apiRequest('/api/customers', { method: 'POST', body: form });
        notify('success', 'Customer registered.');
      }
      setFormOpen(false);
      await loadData();
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const openProfile = async (id: string) => {
    try {
      const data = await apiRequest(`/api/customers/${id}`);
      setProfile(data);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const filtered = customers.filter((c) => typeFilter === 'all' || c.customerType === typeFilter);

  const columns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Customer',
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
            {r.code} · {r.phone} {r.township ? `· ${r.township}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'customerType',
      header: 'Type / Price Tier',
      render: (r) => (
        <span className="text-xs text-slate-600 capitalize">
          {r.customerType} · {r.priceTier}
        </span>
      ),
    },
    {
      key: 'totalPurchases',
      header: 'Total Purchases',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.totalPurchases || 0),
      render: (r) => <span className="font-mono-num text-xs">{formatMMK(r.totalPurchases || 0, currency)}</span>,
    },
    {
      key: 'receivableBalance',
      header: 'Outstanding Debt',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.receivableBalance),
      render: (r) => (
        <span
          className={`font-mono-num text-xs font-bold ${
            Number(r.receivableBalance) > 0 ? 'text-red-700' : 'text-slate-400'
          }`}
        >
          {formatMMK(r.receivableBalance, currency)}
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
            title="View Customer Profile"
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
                phone: r.phone || '',
                secondaryPhone: r.secondaryPhone || '',
                township: r.township || '',
                address: r.address || '',
                customerType: r.customerType || 'retail',
                priceTier: r.priceTier || 'retail',
                defaultDiscountPct: String(Number(r.defaultDiscountPct || 0)),
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
        title={t('nav_customers')}
        subtitle={
          lang === 'my'
            ? 'လက်လီ၊ လက်ကား၊ တပ်ဆင်ရေးကန်ထရိုက်တာနှင့် ကုမ္ပဏီဖောက်သည်များ၏ ဝယ်ယူမှု၊ အကြွေးနှင့် အာမခံမှတ်တမ်းများ'
            : 'Retail, wholesale, installer, and corporate CRM with purchase history, receivables, and warranty tracking'
        }
        actions={
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY_CUST);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        }
      />

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search customer name, phone, township..."
        searchFilter={(r, q) =>
          r.name.toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q) ||
          (r.township || '').toLowerCase().includes(q)
        }
        toolbarExtra={
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          >
            <option value="all">All Customer Types</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="installer">Installer / Contractor</option>
            <option value="corporate">Corporate</option>
          </select>
        }
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Customer' : 'Add New Customer'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Secondary Phone</label>
              <input
                value={form.secondaryPhone}
                onChange={(e) => setForm({ ...form, secondaryPhone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Township</label>
              <input
                value={form.township}
                onChange={(e) => setForm({ ...form, township: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Type</label>
              <select
                value={form.customerType}
                onChange={(e) => setForm({ ...form, customerType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="retail">Retail Customer</option>
                <option value="wholesale">Wholesale Customer</option>
                <option value="installer">Installer / Contractor</option>
                <option value="corporate">Corporate Customer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Price Level</label>
              <select
                value={form.priceTier}
                onChange={(e) => setForm({ ...form, priceTier: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="retail">Retail Price</option>
                <option value="wholesale">Wholesale Price</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg">
              Save Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* Rich Customer Profile Modal */}
      <Modal
        open={Boolean(profile)}
        onClose={() => setProfile(null)}
        title={profile?.customer?.name || 'Customer Profile'}
        subtitle={`${profile?.customer?.code || ''} · ${profile?.customer?.phone || ''} · ${profile?.customer?.address || ''}`}
        size="xl"
      >
        {profile && (
          <div className="space-y-6 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Total Purchases</div>
                <div className="text-base font-bold font-mono-num text-[#14243A] mt-1">
                  {formatMMK(
                    profile.sales.reduce((s: number, x: any) => s + Number(x.grandTotal), 0),
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
                <div className="text-slate-500">Outstanding Debt</div>
                <div className="text-base font-bold font-mono-num text-red-700 mt-1">
                  {formatMMK(profile.customer.receivableBalance, currency)}
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-[#14243A] mb-2">Purchase History ({profile.sales.length})</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profile.sales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                          No sales recorded yet
                        </td>
                      </tr>
                    ) : (
                      profile.sales.map((s: any) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 font-mono-num font-semibold text-blue-700">{s.invoiceNumber}</td>
                          <td className="px-3 py-2 font-mono-num">{formatDateDDMMYYYY(s.saleDate)}</td>
                          <td className="px-3 py-2 text-right font-mono-num">{formatMMK(s.grandTotal, '')}</td>
                          <td className="px-3 py-2 text-right font-mono-num text-red-700">
                            {formatMMK(s.outstandingAmount, '')}
                          </td>
                          <td className="px-3 py-2">
                            <StatusText status={s.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-[#14243A] mb-2">Warranty Records ({profile.warranties.length})</h4>
              {profile.warranties.length === 0 ? (
                <p className="text-slate-400">No serial warranties registered for this customer.</p>
              ) : (
                <div className="space-y-1.5">
                  {profile.warranties.map((w: any) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between p-2.5 border border-slate-200 rounded-lg"
                    >
                      <div>
                        <span className="font-mono-num font-bold text-[#14243A]">{w.serialNumber}</span> ·{' '}
                        <span>{w.productName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num text-slate-500">
                          Ends {formatDateDDMMYYYY(w.warrantyEndDate)}
                        </span>
                        <StatusText status={w.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
