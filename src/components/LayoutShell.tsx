import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Users,
  Building2,
  Wallet,
  FileSpreadsheet,
  ShieldCheck,
  BarChart3,
  UserCog,
  Settings,
  Search,
  Bell,
  Globe,
  Menu,
  X,
  Sun,
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useApp, type NavTab } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { formatMMK } from '../lib/i18n';
import { ConfirmDialog } from './ui/CommonUI';

interface NavItem {
  id: NavTab;
  labelKey: string;
  icon: React.FC<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { id: 'pos', labelKey: 'nav_pos', icon: ShoppingCart },
  { id: 'inventory', labelKey: 'nav_inventory', icon: Package },
  { id: 'purchases', labelKey: 'nav_purchases', icon: Truck },
  { id: 'customers', labelKey: 'nav_customers', icon: Users },
  { id: 'suppliers', labelKey: 'nav_suppliers', icon: Building2 },
  { id: 'finance', labelKey: 'nav_finance', icon: Wallet },
  { id: 'quotations', labelKey: 'nav_quotations', icon: FileSpreadsheet },
  { id: 'warranty', labelKey: 'nav_warranty', icon: ShieldCheck },
  { id: 'reports', labelKey: 'nav_reports', icon: BarChart3 },
  { id: 'employees', labelKey: 'nav_employees', icon: UserCog },
  { id: 'settings', labelKey: 'nav_settings', icon: Settings },
];

export const LayoutShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    t,
    lang,
    setLang,
    activeTab,
    setActiveTab,
    bootstrap,
    refreshBootstrap,
    logout,
    notify,
  } = useApp();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [clearDemoConfirm, setClearDemoConfirm] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);

  // Global search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiRequest(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(res);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const notifs = bootstrap?.notifications;
  const totalAlerts =
    (notifs?.lowStockCount || 0) +
    (notifs?.debtCount || 0) +
    (notifs?.payableCount || 0) +
    (notifs?.expiringWarrantyCount || 0) +
    (notifs?.pendingQuotationCount || 0);

  const handleClearDemo = async () => {
    setClearingDemo(true);
    try {
      await apiRequest('/api/demo/clear', { method: 'POST' });
      await refreshBootstrap();
      setClearDemoConfirm(false);
      notify('success', lang === 'my' ? 'နမူနာဒေတာများကို လုံခြုံစွာ ဖယ်ရှားပြီးပါပြီ။' : 'Demo data safely removed.');
    } catch (error: any) {
      notify('error', error.message || 'Failed to remove demo data.');
    } finally {
      setClearingDemo(false);
    }
  };

  const shopDisplayName =
    lang === 'my'
      ? bootstrap?.settings?.burmeseName || bootstrap?.settings?.shopName || 'ShweSolar ERP'
      : bootstrap?.settings?.shopName || 'ShweSolar ERP';

  const SidebarContent = (
    <div className="flex flex-col h-full bg-[#14243A] text-slate-200 select-none">
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#F59E0B] flex items-center justify-center shrink-0">
            <Sun className="w-4.5 h-4.5 text-[#14243A]" />
          </div>
          {!collapsed && (
            <span className="font-display font-bold text-white text-sm tracking-tight truncate">
              ShweSolar ERP
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileOpen(false);
              }}
              title={collapsed ? t(item.labelKey) : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#2563EB] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
              {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => setLang(lang === 'my' ? 'en' : 'my')}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white/8 hover:bg-white/14 text-slate-200 transition-colors"
        >
          <Globe className="w-4 h-4 text-[#F59E0B] shrink-0" />
          {!collapsed && <span>{lang === 'my' ? 'English သို့ ပြောင်းရန်' : 'မြန်မာဘာသာ ပြောင်းရန်'}</span>}
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t('sign_out')}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F6F9]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[252px]'
        } sticky top-0 h-screen no-print`}
      >
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-64 h-full shadow-2xl">{SidebarContent}</div>
          <div className="flex-1 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:block text-sm font-semibold text-[#14243A] truncate max-w-[240px]">
              {shopDisplayName}
            </div>
          </div>

          {/* Global Search */}
          <div ref={searchRef} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_placeholder')}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />

            {searchResults && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-96 overflow-y-auto z-50 divide-y divide-slate-100">
                {searching ? (
                  <div className="p-4 text-xs text-slate-500">{t('loading')}</div>
                ) : (
                  <>
                    {searchResults.products?.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">Products</div>
                        {searchResults.products.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setActiveTab('inventory');
                              setSearchResults(null);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-medium text-slate-800 truncate">{p.name}</span>
                            <span className="font-mono-num text-slate-500 ml-2 shrink-0">
                              {formatMMK(p.sellingPrice)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.sales?.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">Sales Invoices</div>
                        {searchResults.sales.map((s: any) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setActiveTab('pos');
                              setSearchResults(null);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-mono-num font-semibold text-blue-700">{s.invoiceNumber}</span>
                            <span className="text-slate-600 truncate mx-2">{s.customerName}</span>
                            <span className="font-mono-num text-slate-800 shrink-0">
                              {formatMMK(s.grandTotal)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.customers?.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">Customers</div>
                        {searchResults.customers.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setActiveTab('customers');
                              setSearchResults(null);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-medium text-slate-800">{c.name}</span>
                            <span className="text-slate-500">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.warranties?.length > 0 && (
                      <div className="p-2">
                        <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">Warranty Serials</div>
                        {searchResults.warranties.map((w: any) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => {
                              setActiveTab('warranty');
                              setSearchResults(null);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-mono-num font-semibold text-slate-800">{w.serialNumber}</span>
                            <span className="text-slate-500 truncate ml-2">{w.productName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {!searchResults.products?.length &&
                      !searchResults.sales?.length &&
                      !searchResults.customers?.length &&
                      !searchResults.warranties?.length && (
                        <div className="p-4 text-xs text-slate-500 text-center">No matching records found</div>
                      )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Action Zone */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Notifications Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Business alerts"
              >
                <Bell className="w-5 h-5" />
                {totalAlerts > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {totalAlerts}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#14243A]">
                      {lang === 'my' ? 'လုပ်ငန်းသတိပေးချက်များ' : 'Operational Alerts'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('inventory');
                        setNotifOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="text-slate-700 font-medium">
                        {lang === 'my' ? 'လက်ကျန်နည်းပစ္စည်းများ' : 'Low Stock Products'}
                      </span>
                      <span className="font-mono-num font-bold text-amber-700">
                        {notifs?.lowStockCount || 0}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('customers');
                        setNotifOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="text-slate-700 font-medium">
                        {lang === 'my' ? 'ဖောက်သည်ရရန်ရှိငွေ (Receivables)' : 'Outstanding Customer Debts'}
                      </span>
                      <span className="font-mono-num font-bold text-red-700">
                        {formatMMK(notifs?.totalReceivables || 0)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('suppliers');
                        setNotifOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="text-slate-700 font-medium">
                        {lang === 'my' ? 'ကုန်ပေးသွင်းသူပေးရန်ရှိငွေ (Payables)' : 'Supplier Payables Due'}
                      </span>
                      <span className="font-mono-num font-bold text-amber-700">
                        {formatMMK(notifs?.totalPayables || 0)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('warranty');
                        setNotifOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="text-slate-700 font-medium">
                        {lang === 'my' ? 'အာမခံသက်တမ်းကုန်ခါနီး' : 'Warranties Expiring Soon (30d)'}
                      </span>
                      <span className="font-mono-num font-bold text-blue-700">
                        {notifs?.expiringWarrantyCount || 0}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('quotations');
                        setNotifOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="text-slate-700 font-medium">
                        {lang === 'my' ? 'ဆောင်ရွက်ဆဲ ဈေးနှုန်းလွှာများ' : 'Pending Quotations'}
                      </span>
                      <span className="font-mono-num font-bold text-slate-700">
                        {notifs?.pendingQuotationCount || 0}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:flex flex-col text-right leading-tight">
              <span className="text-xs font-semibold text-[#14243A] truncate max-w-[140px]">
                {bootstrap?.user?.fullName || bootstrap?.user?.email}
              </span>
              <span className="text-[11px] text-slate-500 capitalize">{bootstrap?.user?.role || 'Owner'}</span>
            </div>
          </div>
        </header>

        {/* Optional Clearly Labeled Demo Banner */}
        {bootstrap?.hasDemoData && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs no-print">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-medium">
                {lang === 'my'
                  ? 'နမူနာဒေတာများ (Demo Data) ပါဝင်နေပါသည်။ လုပ်ငန်းအစစ်အမှန် စတင်အသုံးပြုရန် နမူနာဒေတာများကို ဖယ်ရှားနိုင်ပါသည်။'
                  : 'Sample Demo Data is currently loaded for evaluation. Your real records remain separated and demo data can be safely removed anytime.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setClearDemoConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 font-semibold text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('remove_demo')}</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>

      <ConfirmDialog
        open={clearDemoConfirm}
        onClose={() => setClearDemoConfirm(false)}
        onConfirm={handleClearDemo}
        title={t('remove_demo')}
        message={
          lang === 'my'
            ? 'နမူနာဒေတာ (Demo Data) အားလုံးကို ဖျက်ထုတ်မည်ဖြစ်ပြီး သင်ကိုယ်တိုင်ထည့်သွင်းထားသော စာရင်းအစစ်အမှန်များကို ထိခိုက်မည်မဟုတ်ပါ။ ဆက်လက်လုပ်ဆောင်မည်လား?'
            : 'This will safely delete only records tagged as Demo Data and recalculate all real account balances. Any real business transactions you recorded will remain untouched.'
        }
        confirmLabel={t('remove_demo')}
        danger
        loading={clearingDemo}
      />
    </div>
  );
};
