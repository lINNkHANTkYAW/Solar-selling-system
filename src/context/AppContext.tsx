import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiRequest, setAuthToken } from '../lib/api';
import { translate, type Language } from '../lib/i18n';

export type NavTab =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'quotations'
  | 'warranty'
  | 'reports'
  | 'employees'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface BootstrapData {
  user: {
    id: string;
    uid: string;
    email: string;
    fullName: string;
    role: string;
    onboardingCompleted: boolean;
  };
  settings: any;
  branches: any[];
  categories: any[];
  accounts: any[];
  hasDemoData: boolean;
  notifications: {
    lowStockCount: number;
    lowStockItems: any[];
    debtCount: number;
    totalReceivables: number;
    payableCount: number;
    totalPayables: number;
    expiringWarrantyCount: number;
    pendingQuotationCount: number;
  };
}

interface AppContextValue {
  firebaseUser: FirebaseUser | null;
  authLoading: boolean;
  bootstrap: BootstrapData | null;
  bootstrapLoading: boolean;
  bootstrapError: string | null;
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  refreshBootstrap: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  quickActionIntent: string | null;
  triggerQuickAction: (tab: NavTab, intent: string) => void;
  clearQuickActionIntent: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [quickActionIntent, setQuickActionIntent] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = window.localStorage.getItem('shwesolar_lang');
      return saved === 'en' ? 'en' : 'my';
    } catch {
      return 'my';
    }
  });

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem('shwesolar_lang', next);
    } catch {
      // Ignore storage failures
    }
  }, []);

  const t = useCallback((key: string) => translate(key, lang), [lang]);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const refreshBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError(null);
    try {
      const data = await apiRequest<BootstrapData>('/api/bootstrap');
      setBootstrap(data);
    } catch (error: any) {
      setBootstrapError(error.message || 'Failed to connect to ERP server.');
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const token = await user.getIdToken();
        setAuthToken(token);
        await refreshBootstrap();
      } else {
        setAuthToken(null);
        setBootstrap(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [refreshBootstrap]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error: any) {
      notify('error', error.message || 'Sign-in cancelled or failed.');
    }
  }, [notify]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setAuthToken(null);
    setBootstrap(null);
  }, []);

  const triggerQuickAction = useCallback((tab: NavTab, intent: string) => {
    setActiveTab(tab);
    setQuickActionIntent(intent);
  }, []);

  const clearQuickActionIntent = useCallback(() => {
    setQuickActionIntent(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        firebaseUser,
        authLoading,
        bootstrap,
        bootstrapLoading,
        bootstrapError,
        lang,
        setLang,
        t,
        activeTab,
        setActiveTab,
        refreshBootstrap,
        signInWithGoogle,
        logout,
        notify,
        toasts,
        dismissToast,
        quickActionIntent,
        triggerQuickAction,
        clearQuickActionIntent,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
