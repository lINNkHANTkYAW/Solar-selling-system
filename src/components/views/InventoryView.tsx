import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Download, Upload, ArrowUpDown, Edit2, Archive, History } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest, downloadCSV } from '../../lib/api';
import { formatDateDDMMYYYY, formatMMK } from '../../lib/i18n';
import {
  ConfirmDialog,
  DataTable,
  Modal,
  PageHeader,
  ProductThumbnail,
  StatusText,
  type ColumnDef,
} from '../ui/CommonUI';

const UNITS = ['PCS', 'Set', 'Meter', 'Roll', 'Box', 'Pair', 'kW', 'W'];

const EMPTY_FORM = {
  sku: '',
  barcode: '',
  name: '',
  burmeseName: '',
  brand: '',
  model: '',
  categoryId: '',
  description: '',
  specifications: '',
  unit: 'PCS',
  purchasePrice: '0',
  sellingPrice: '0',
  wholesalePrice: '0',
  minStockLevel: '5',
  currentStock: '0',
  warrantyMonths: '12',
  trackSerial: false,
  imageUrl: '',
};

export const InventoryView: React.FC = () => {
  const { t, lang, bootstrap, refreshBootstrap, notify, quickActionIntent, clearQuickActionIntent } =
    useApp();
  const currency = bootstrap?.settings?.currency || 'MMK';

  const [tab, setTab] = useState<'catalog' | 'movements'>('catalog');
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [catFilter, setCatFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    productId: '',
    adjustmentType: 'adjustment_in',
    quantity: '1',
    reason: '',
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, moves] = await Promise.all([
        apiRequest<any[]>('/api/products'),
        apiRequest<any[]>('/api/stock-movements'),
      ]);
      setProducts(prods);
      setMovements(moves);
    } catch (error: any) {
      notify('error', error.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (quickActionIntent === 'add_product') {
      setEditingId(null);
      setForm({ ...EMPTY_FORM, categoryId: bootstrap?.categories?.[0]?.id || '' });
      setFormOpen(true);
      clearQuickActionIntent();
    } else if (quickActionIntent === 'adjust_stock') {
      setAdjustOpen(true);
      clearQuickActionIntent();
    }
  }, [quickActionIntent, bootstrap, clearQuickActionIntent]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (brandFilter !== 'all' && p.brand !== brandFilter) return false;
      if (statusFilter !== 'all' && p.stockStatus !== statusFilter) return false;
      return true;
    });
  }, [products, catFilter, brandFilter, statusFilter]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/products/${editingId}`, { method: 'PUT', body: form });
        notify('success', 'Product updated cleanly.');
      } else {
        await apiRequest('/api/products', { method: 'POST', body: form });
        notify('success', 'Product created and opening stock recorded.');
      }
      setFormOpen(false);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/products/adjust', {
        method: 'POST',
        body: adjustForm,
      });
      notify('success', 'Stock adjustment applied and logged to immutable movement ledger.');
      setAdjustOpen(false);
      setAdjustForm({ productId: '', adjustmentType: 'adjustment_in', quantity: '1', reason: '' });
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message || 'Stock adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await apiRequest(`/api/products/${archiveTarget.id}`, { method: 'DELETE' });
      notify('success', `${archiveTarget.name} archived.`);
      setArchiveTarget(null);
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    }
  };

  const handleImportCSV = async () => {
    const lines = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      notify('error', 'Paste header row + at least one product row in CSV format.');
      return;
    }
    const items = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim());
      return {
        sku: cols[0],
        name: cols[1],
        burmeseName: cols[2] || cols[1],
        brand: cols[3] || '',
        category: cols[4] || '',
        unit: cols[5] || 'PCS',
        purchasePrice: Number(cols[6] || 0),
        sellingPrice: Number(cols[7] || 0),
        wholesalePrice: Number(cols[8] || cols[7] || 0),
        currentStock: Number(cols[9] || 0),
        warrantyMonths: Number(cols[10] || 12),
      };
    });
    setSaving(true);
    try {
      const res = await apiRequest<{ importedCount: number; errors: string[] }>('/api/products/import', {
        method: 'POST',
        body: { items },
      });
      notify(
        'success',
        `Imported ${res.importedCount} products${res.errors.length ? ` (${res.errors.length} skipped)` : ''}.`
      );
      setImportOpen(false);
      setImportText('');
      await Promise.all([loadData(), refreshBootstrap()]);
    } catch (error: any) {
      notify('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportProducts = () => {
    downloadCSV(
      'shwesolar-inventory.csv',
      [
        { key: 'sku', label: 'SKU' },
        { key: 'barcode', label: 'Barcode' },
        { key: 'name', label: 'Product Name' },
        { key: 'burmeseName', label: 'Burmese Name' },
        { key: 'brand', label: 'Brand' },
        { key: 'categoryName', label: 'Category' },
        { key: 'unit', label: 'Unit' },
        { key: 'weightedAvgCost', label: 'Weighted Avg Cost' },
        { key: 'sellingPrice', label: 'Selling Price' },
        { key: 'wholesalePrice', label: 'Wholesale Price' },
        { key: 'currentStock', label: 'Current Stock' },
        { key: 'minStockLevel', label: 'Min Stock' },
        { key: 'warrantyMonths', label: 'Warranty Months' },
      ],
      filteredProducts
    );
  };

  const productCols: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <ProductThumbnail src={r.imageUrl} alt={r.name} size="sm" />
          <div className="min-w-0">
            <div className="font-semibold text-[#14243A] text-xs truncate max-w-[260px]">{r.name}</div>
            <div className="text-[11px] text-slate-500 truncate max-w-[260px]">
              {r.sku} · {r.brand || '—'} · {r.categoryName}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'weightedAvgCost',
      header: 'Avg Cost',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.weightedAvgCost),
      render: (r) => <span className="font-mono-num text-xs">{formatMMK(r.weightedAvgCost, '')}</span>,
    },
    {
      key: 'sellingPrice',
      header: 'Retail / Wholesale',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.sellingPrice),
      render: (r) => (
        <div className="text-right">
          <div className="font-mono-num text-xs font-semibold text-[#14243A]">
            {formatMMK(r.sellingPrice, currency)}
          </div>
          <div className="font-mono-num text-[11px] text-slate-500">
            WS: {formatMMK(r.wholesalePrice, '')}
          </div>
        </div>
      ),
    },
    {
      key: 'currentStock',
      header: 'Stock',
      align: 'right',
      sortable: true,
      sortValue: (r) => Number(r.currentStock),
      render: (r) => (
        <div className="text-right">
          <div className="font-mono-num font-bold text-xs">
            {Number(r.currentStock)} {r.unit}
          </div>
          <div className="text-[10px] text-slate-400">Min: {r.minStockLevel}</div>
        </div>
      ),
    },
    {
      key: 'stockStatus',
      header: 'Status',
      render: (r) => <StatusText status={r.stockStatus} />,
    },
    {
      key: 'warrantyMonths',
      header: 'Warranty',
      align: 'center',
      render: (r) => (
        <span className="text-xs font-mono-num text-slate-600">
          {r.warrantyMonths}m {r.trackSerial ? '· S/N' : ''}
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
            title="Adjust Stock"
            onClick={() => {
              setAdjustForm({ productId: r.id, adjustmentType: 'adjustment_in', quantity: '1', reason: '' });
              setAdjustOpen(true);
            }}
            className="p-1.5 text-blue-700 hover:bg-blue-50 rounded"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Edit Product"
            onClick={() => {
              setEditingId(r.id);
              setForm({
                sku: r.sku,
                barcode: r.barcode || '',
                name: r.name,
                burmeseName: r.burmeseName || '',
                brand: r.brand || '',
                model: r.model || '',
                categoryId: r.categoryId || '',
                description: r.description || '',
                specifications: r.specifications || '',
                unit: r.unit || 'PCS',
                purchasePrice: String(Number(r.purchasePrice)),
                sellingPrice: String(Number(r.sellingPrice)),
                wholesalePrice: String(Number(r.wholesalePrice)),
                minStockLevel: String(r.minStockLevel),
                currentStock: String(Number(r.currentStock)),
                warrantyMonths: String(r.warrantyMonths),
                trackSerial: Boolean(r.trackSerial),
                imageUrl: r.imageUrl || '',
              });
              setFormOpen(true);
            }}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Archive Product"
            onClick={() => setArchiveTarget(r)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const movementCols: ColumnDef<any>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (r) => <span className="font-mono-num text-xs">{formatDateDDMMYYYY(r.createdAt)}</span>,
    },
    {
      key: 'productName',
      header: 'Product',
      render: (r) => (
        <div>
          <div className="font-medium text-xs text-[#14243A]">{r.productName}</div>
          <div className="text-[11px] text-slate-500 font-mono-num">{r.productSku}</div>
        </div>
      ),
    },
    {
      key: 'movementType',
      header: 'Type',
      render: (r) => (
        <span className="text-xs font-semibold capitalize text-slate-700">
          {String(r.movementType).replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'referenceNumber',
      header: 'Reference',
      render: (r) => <span className="font-mono-num text-xs text-blue-700">{r.referenceNumber || '—'}</span>,
    },
    {
      key: 'quantity',
      header: 'Change',
      align: 'right',
      render: (r) => {
        const val = Number(r.quantity);
        return (
          <span className={`font-mono-num text-xs font-bold ${val >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {val > 0 ? `+${val}` : val} {r.unit}
          </span>
        );
      },
    },
    {
      key: 'stockTrail',
      header: 'Prev → New',
      align: 'right',
      render: (r) => (
        <span className="font-mono-num text-xs text-slate-600">
          {Number(r.previousQty)} → <strong className="text-[#14243A]">{Number(r.newQty)}</strong>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason & User',
      render: (r) => (
        <div className="text-xs max-w-[240px]">
          <div className="text-slate-700 truncate">{r.reason}</div>
          <div className="text-[11px] text-slate-400">{r.userName}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav_inventory')}
        subtitle={
          lang === 'my'
            ? 'ဆိုလာပစ္စည်းကတ်တလောက်၊ ပျမ်းမျှကုန်ကျစရိတ် (WAC) နှင့် စတော့အဝင်/အထွက် မှတ်တမ်းအပြည့်အစုံ'
            : 'Solar product catalog, Weighted Average Costing (WAC), controlled adjustments, and stock movement audit trail'
        }
        actions={
          <>
            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
              <button
                type="button"
                onClick={() => setTab('catalog')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'catalog' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                Catalog ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('movements')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md ${
                  tab === 'movements' ? 'bg-[#14243A] text-white' : 'text-slate-600'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Stock Movements</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAdjustOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-[#14243A] rounded-lg"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Adjust Stock</span>
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-[#14243A] rounded-lg"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportProducts}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-[#14243A] rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('export_csv')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY_FORM, categoryId: bootstrap?.categories?.[0]?.id || '' });
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>{t('qa_add_product')}</span>
            </button>
          </>
        }
      />

      {tab === 'catalog' ? (
        <DataTable
          data={filteredProducts}
          columns={productCols}
          loading={loading}
          searchPlaceholder="Search SKU, barcode, English or Burmese name, brand..."
          searchFilter={(r, q) =>
            r.name.toLowerCase().includes(q) ||
            (r.burmeseName || '').toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            (r.brand || '').toLowerCase().includes(q)
          }
          toolbarExtra={
            <>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">All Categories</option>
                {(bootstrap?.categories || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">All Brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">All Stock Status</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </>
          }
        />
      ) : (
        <DataTable
          data={movements}
          columns={movementCols}
          loading={loading}
          searchPlaceholder="Filter by product, SKU, reference #, or reason..."
          searchFilter={(r, q) =>
            r.productName.toLowerCase().includes(q) ||
            r.productSku.toLowerCase().includes(q) ||
            (r.referenceNumber || '').toLowerCase().includes(q) ||
            (r.reason || '').toLowerCase().includes(q)
          }
        />
      )}

      {/* Add/Edit Product Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Solar Product' : 'Add New Solar Product'}
        subtitle={
          editingId
            ? 'Stock quantity is protected here; use Controlled Stock Adjustment or Purchases to change stock.'
            : 'Opening stock entered here automatically records an auditable Opening Stock Movement.'
        }
        size="xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-[#14243A] mb-3 pb-1.5 border-b border-slate-100">
              1. Identification & Classification
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">SKU / Product Code *</label>
                <input
                  required
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Barcode</label>
                <input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Select Category</option>
                  {(bootstrap?.categories || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.burmeseName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name (English) *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">မြန်မာအမည် (Burmese Name)</label>
                <input
                  value={form.burmeseName}
                  onChange={(e) => setForm({ ...form, burmeseName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brand</label>
                <input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Model</label>
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-[#14243A] mb-3 pb-1.5 border-b border-slate-100">
              2. Pricing, Stock & Warranty
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Price ({currency})</label>
                <input
                  type="number"
                  min="0"
                  value={form.purchasePrice}
                  onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price ({currency}) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Wholesale Price ({currency})</label>
                <input
                  type="number"
                  min="0"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              {!editingId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Stock Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={form.currentStock}
                    onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Stock Level</label>
                <input
                  type="number"
                  min="0"
                  value={form.minStockLevel}
                  onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Warranty (Months)</label>
                <input
                  type="number"
                  min="0"
                  value={form.warrantyMonths}
                  onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Technical Specifications</label>
                <input
                  value={form.specifications}
                  onChange={(e) => setForm({ ...form, specifications: e.target.value })}
                  placeholder="e.g. 550W, Half-Cut Mono, 49.8V Voc"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.trackSerial}
                    onChange={(e) => setForm({ ...form, trackSerial: e.target.checked })}
                    className="w-4 h-4 accent-[#2563EB]"
                  />
                  <span>Enable Serial Number Warranty Tracking at POS</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Controlled Stock Adjustment Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Controlled Stock Adjustment"
        subtitle="Every stock adjustment requires a mandatory audit reason and writes to Stock Movement History."
        size="md"
      >
        <form onSubmit={handleStockAdjustment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Product *</label>
            <select
              required
              value={adjustForm.productId}
              onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Select Product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name} (Current: {Number(p.currentStock)} {p.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Type</label>
              <select
                value={adjustForm.adjustmentType}
                onChange={(e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="adjustment_in">Stock In / Physical Surplus (+)</option>
                <option value="found">Found Stock (+)</option>
                <option value="adjustment_out">Physical Correction / Shortage (-)</option>
                <option value="damaged">Damaged Stock (-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity *</label>
              <input
                type="number"
                required
                min="1"
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mandatory Audit Reason *</label>
            <textarea
              required
              rows={3}
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              placeholder="e.g. Monthly warehouse physical stock count verification"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdjustOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#14243A] rounded-lg"
            >
              Apply Adjustment
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Solar Products (CSV)"
        subtitle="Columns: sku,name,burmeseName,brand,category,unit,purchasePrice,sellingPrice,wholesalePrice,currentStock,warrantyMonths"
        size="lg"
      >
        <div className="space-y-4">
          <textarea
            rows={8}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={
              'sku,name,burmeseName,brand,category,unit,purchasePrice,sellingPrice,wholesalePrice,currentStock,warrantyMonths\nSP-JA-555,JA Solar 555W Panel,JA 555W ဆိုလာပြား,JA Solar,Solar Panels,PCS,305000,375000,350000,20,120'
            }
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setImportOpen(false)} className="px-4 py-2 text-sm border rounded-lg">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleImportCSV}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg"
            >
              {saving ? 'Importing...' : 'Run CSV Import'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title="Archive Product"
        message={`Archive "${archiveTarget?.name}" from active inventory? Historical sales and stock movements will remain preserved for accounting integrity.`}
        confirmLabel="Archive"
        danger
      />
    </div>
  );
};
