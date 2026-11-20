import React, { useEffect, useState } from 'react';
import { Save, Database, Trash2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../lib/api';
import { ConfirmDialog, PageHeader } from '../ui/CommonUI';

export const SettingsView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify } = useApp();
  const [form, setForm] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [newBranch, setNewBranch] = useState({ name: '', code: '', address: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    apiRequest<{ settings: any; branches: any[] }>('/api/settings')
      .then((res) => {
        setForm(res.settings);
        setBranches(res.branches);
      })
      .catch((err) => notify('error', err.message));
  }, [notify]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/settings', { method: 'PUT', body: form });
      await refreshBootstrap();
      notify('success', 'Business and system settings saved.');
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranch.name || !newBranch.code) return;
    try {
      const created = await apiRequest('/api/branches', { method: 'POST', body: newBranch });
      setBranches((prev) => [...prev, created]);
      setNewBranch({ name: '', code: '', address: '', phone: '' });
      notify('success', 'Branch added.');
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleLoadDemo = async () => {
    setDemoLoading(true);
    try {
      await apiRequest('/api/demo/load', { method: 'POST' });
      await refreshBootstrap();
      notify('success', 'Clearly labeled Myanmar solar shop demo data loaded.');
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setDemoLoading(false);
    }
  };

  const handleClearDemo = async () => {
    setDemoLoading(true);
    try {
      await apiRequest('/api/demo/clear', { method: 'POST' });
      await refreshBootstrap();
      setClearConfirm(false);
      notify('success', 'All demo data safely removed.');
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setDemoLoading(false);
    }
  };

  if (!form) {
    return <div className="p-8 text-sm text-slate-500">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={t('nav_settings')}
        subtitle={
          lang === 'my'
            ? 'ဆိုင်အချက်အလက်၊ အခွန်၊ စတော့မူဝါဒ၊ ဆိုင်ခွဲစီမံခန့်ခွဲမှုနှင့် နမူနာဒေတာ ထိန်းချုပ်ခြင်း'
            : 'Shop profile, optional tax, inventory policies, branch architecture, and demo dataset controls'
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business Profile */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#14243A] pb-2 border-b border-slate-100">
            Business Profile & Receipt Branding
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Name (English)</label>
              <input
                value={form.shopName || ''}
                onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ဆိုင်အမည် (မြန်မာ)</label>
              <input
                value={form.burmeseName || ''}
                onChange={(e) => setForm({ ...form, burmeseName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Address</label>
              <input
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Currency</label>
              <select
                value={form.currency || 'MMK'}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="MMK">MMK (Myanmar Kyat)</option>
                <option value="USD">USD</option>
                <option value="THB">THB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Prefix</label>
              <input
                value={form.invoicePrefix || 'INV'}
                onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Footer Message</label>
              <textarea
                rows={2}
                value={form.receiptFooter || ''}
                onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* System, Tax & Inventory Policies */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#14243A] pb-2 border-b border-slate-100">
            Tax, Inventory & Module Policies
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Optional Tax Rate (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={Number(form.taxRate || 0)}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Low Stock Threshold</label>
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold ?? 5}
                onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Warranty (Months)</label>
              <input
                type="number"
                min="0"
                value={form.defaultWarrantyMonths ?? 12}
                onChange={(e) => setForm({ ...form, defaultWarrantyMonths: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.taxEnabled)}
                onChange={(e) => setForm({ ...form, taxEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#2563EB]"
              />
              <span className="font-medium text-slate-700">Enable Commercial Tax calculation at POS checkout</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.allowNegativeStock)}
                onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })}
                className="w-4 h-4 accent-[#2563EB]"
              />
              <span className="font-medium text-slate-700">
                Allow Negative Stock (Disabled by default for strict inventory accuracy)
              </span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.enableMultiBranch)}
                onChange={(e) => setForm({ ...form, enableMultiBranch: e.target.checked })}
                className="w-4 h-4 accent-[#2563EB]"
              />
              <span className="font-medium text-slate-700">Enable Multi-Branch Configuration</span>
            </label>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Branch Configuration */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#14243A]">Branches ({branches.length})</h3>
        <div className="space-y-2 text-xs">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="font-bold text-[#14243A]">{b.name}</span>{' '}
                <span className="font-mono-num text-slate-500">({b.code})</span>
                <div className="text-slate-500 mt-0.5">{b.address}</div>
              </div>
              {b.isDefault && <span className="font-semibold text-emerald-700">Primary Branch</span>}
            </div>
          ))}
        </div>
        {form.enableMultiBranch && (
          <form onSubmit={handleAddBranch} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
            <input
              placeholder="Branch Name (e.g. Mandalay)"
              value={newBranch.name}
              onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <input
              placeholder="Code (MDY-02)"
              value={newBranch.code}
              onChange={(e) => setNewBranch({ ...newBranch, code: e.target.value })}
              className="px-3 py-2 text-xs font-mono-num border border-slate-300 rounded-lg"
            />
            <input
              placeholder="Address"
              value={newBranch.address}
              onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-[#14243A] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Branch</span>
            </button>
          </form>
        )}
      </div>

      {/* Demo Data Manager */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#14243A] flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-600" />
            <span>Optional Sample / Demo Data Manager</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Load clearly tagged sample solar equipment, sales, packages, and warranties for testing — or safely delete all demo records while keeping your real shop records intact.
          </p>
        </div>
        <div className="shrink-0">
          {bootstrap?.hasDemoData ? (
            <button
              type="button"
              disabled={demoLoading}
              onClick={() => setClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('remove_demo')}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={demoLoading}
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14243A] hover:bg-[#1e3554] rounded-lg"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{demoLoading ? 'Loading...' : t('load_demo')}</span>
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={handleClearDemo}
        title="Safely Remove Demo Data"
        message="This removes only records tagged as Demo Data and recalculates real account balances. Real business entries will never be touched."
        confirmLabel="Remove Demo Data"
        danger
        loading={demoLoading}
      />
    </div>
  );
};
