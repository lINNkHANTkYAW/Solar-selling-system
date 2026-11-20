import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthGate } from './components/AuthGate';
import { OnboardingWizard } from './components/OnboardingWizard';
import { LayoutShell } from './components/LayoutShell';
import { ToastContainer } from './components/ui/CommonUI';
import { DashboardView } from './components/views/DashboardView';
import { PosSalesView } from './components/views/PosSalesView';
import { InventoryView } from './components/views/InventoryView';
import { PurchasesView } from './components/views/PurchasesView';
import { CustomersView } from './components/views/CustomersView';
import { SuppliersView } from './components/views/SuppliersView';
import { FinanceView } from './components/views/FinanceView';
import { QuotationsPackagesView } from './components/views/QuotationsPackagesView';
import { WarrantyView } from './components/views/WarrantyView';
import { ReportsView } from './components/views/ReportsView';
import { EmployeesAuditView } from './components/views/EmployeesAuditView';
import { SettingsView } from './components/views/SettingsView';

const WorkspaceRouter: React.FC = () => {
  const {
    firebaseUser,
    authLoading,
    bootstrap,
    bootstrapLoading,
    bootstrapError,
    refreshBootstrap,
    activeTab,
  } = useApp();

  if (authLoading || (firebaseUser && bootstrapLoading && !bootstrap)) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#14243A] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Loading ShweSolar ERP...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthGate />;
  }

  if (bootstrapError && !bootstrap) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
        <div className="max-w-md bg-white border border-red-200 rounded-xl p-6 text-center space-y-4">
          <h2 className="text-base font-bold text-[#14243A]">Unable to Load Workspace</h2>
          <p className="text-sm text-slate-600">{bootstrapError}</p>
          <button
            type="button"
            onClick={refreshBootstrap}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] rounded-lg"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (bootstrap && !bootstrap.user.onboardingCompleted) {
    return <OnboardingWizard />;
  }

  return (
    <LayoutShell>
      {activeTab === 'dashboard' && <DashboardView />}
      {activeTab === 'pos' && <PosSalesView />}
      {activeTab === 'inventory' && <InventoryView />}
      {activeTab === 'purchases' && <PurchasesView />}
      {activeTab === 'customers' && <CustomersView />}
      {activeTab === 'suppliers' && <SuppliersView />}
      {activeTab === 'finance' && <FinanceView />}
      {activeTab === 'quotations' && <QuotationsPackagesView />}
      {activeTab === 'warranty' && <WarrantyView />}
      {activeTab === 'reports' && <ReportsView />}
      {activeTab === 'employees' && <EmployeesAuditView />}
      {activeTab === 'settings' && <SettingsView />}
    </LayoutShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <WorkspaceRouter />
      <ToastContainer />
    </AppProvider>
  );
}
