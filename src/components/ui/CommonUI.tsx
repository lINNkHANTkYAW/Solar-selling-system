import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpDown,
  X,
  Sun,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-[#14243A] tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center flex-wrap gap-2.5 shrink-0">{actions}</div>}
  </div>
);

// Clean typographic status indicator (Zero-pill discipline: unboxed colored text with clear label)
export const StatusText: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const { t } = useApp();
  const map: Record<string, { color: string; key: string }> = {
    in_stock: { color: 'text-emerald-700', key: 'status_in_stock' },
    low_stock: { color: 'text-amber-700', key: 'status_low_stock' },
    out_of_stock: { color: 'text-red-700', key: 'status_out_of_stock' },
    fully_paid: { color: 'text-emerald-700', key: 'status_fully_paid' },
    partially_paid: { color: 'text-amber-700', key: 'status_partially_paid' },
    completed: { color: 'text-blue-700', key: 'status_completed' },
    received: { color: 'text-blue-700', key: 'status_received' },
    draft: { color: 'text-slate-500', key: 'status_draft' },
    cancelled: { color: 'text-red-700', key: 'status_cancelled' },
    returned: { color: 'text-red-700', key: 'status_returned' },
    partially_returned: { color: 'text-amber-700', key: 'status_partially_returned' },
    active: { color: 'text-emerald-700', key: 'status_active' },
    expiring_soon: { color: 'text-amber-700', key: 'status_expiring_soon' },
    expired: { color: 'text-red-700', key: 'status_expired' },
    under_claim: { color: 'text-blue-700', key: 'status_under_claim' },
    replaced: { color: 'text-slate-600', key: 'status_replaced' },
    sent: { color: 'text-blue-700', key: 'Sent' },
    approved: { color: 'text-emerald-700', key: 'Approved' },
    rejected: { color: 'text-red-700', key: 'Rejected' },
    converted: { color: 'text-emerald-700', key: 'Converted' },
    closed: { color: 'text-emerald-700', key: 'Closed' },
    finalized: { color: 'text-emerald-700', key: 'Finalized' },
    reopened: { color: 'text-amber-700', key: 'Reopened' },
  };
  const cfg = map[status] || { color: 'text-slate-600', key: status };
  const text = label || (cfg.key.startsWith('status_') ? t(cfg.key) : cfg.key);
  return <span className={`text-xs font-semibold whitespace-nowrap ${cfg.color}`}>{text}</span>;
};

export const ProductThumbnail: React.FC<{
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ src, alt, size = 'md' }) => {
  const [failed, setFailed] = useState(false);
  const dims =
    size === 'sm' ? 'w-10 h-10 rounded-md' : size === 'lg' ? 'w-full h-36 rounded-lg' : 'w-12 h-12 rounded-lg';

  if (!src || failed) {
    return (
      <div
        className={`${dims} bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0`}
        aria-label={alt}
      >
        <Sun className={size === 'lg' ? 'w-8 h-8 text-amber-500/70' : 'w-5 h-5 text-amber-500/70'} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} object-cover border border-slate-200 shrink-0 bg-slate-50`}
    />
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, size = 'lg', children }) => {
  if (!open) return null;
  const maxW =
    size === 'md' ? 'max-w-lg' : size === 'xl' ? 'max-w-4xl' : 'max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]">
      <div
        className={`w-full ${maxW} bg-white rounded-xl border border-slate-200 shadow-xl max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-[#14243A]">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}> = ({ open, onClose, onConfirm, title, message, confirmLabel, danger = false, loading = false }) => {
  const { t } = useApp();
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <p className="text-sm text-slate-600 leading-relaxed mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#2563EB] hover:bg-blue-700'
          }`}
        >
          {loading ? '...' : confirmLabel || t('confirm')}
        </button>
      </div>
    </Modal>
  );
};

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id?: string }>({
  data,
  columns,
  loading,
  emptyTitle,
  emptyAction,
  searchPlaceholder,
  searchFilter,
  toolbarExtra,
  pageSize = 10,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  toolbarExtra?: React.ReactNode;
  pageSize?: number;
}) {
  const { t } = useApp();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let rows = data;
    if (search.trim() && searchFilter) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => searchFilter(r, q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col && col.sortValue) {
        const dir = sortDir === 'asc' ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });
      }
    }
    return rows;
  }, [data, search, searchFilter, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {(searchFilter || toolbarExtra) && (
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {searchFilter ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder || 'Search...'}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbarExtra && <div className="flex items-center flex-wrap gap-2">{toolbarExtra}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.sortable && col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-[#14243A]"
                    >
                      <span>{col.header}</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-slate-500">{emptyTitle || t('no_data')}</p>
                  {emptyAction && <div className="mt-3">{emptyAction}</div>}
                </td>
              </tr>
            ) : (
              paginated.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className="hover:bg-slate-50/80 transition-colors text-sm text-slate-800"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="tabular-nums">
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-slate-700 tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 max-w-sm w-full no-print">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm bg-white ${
            toast.type === 'success'
              ? 'border-emerald-200 text-emerald-900'
              : toast.type === 'error'
                ? 'border-red-200 text-red-900'
                : 'border-slate-200 text-slate-800'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
          <span className="flex-1 leading-snug">{toast.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
