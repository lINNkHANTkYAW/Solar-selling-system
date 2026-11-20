import React from 'react';
import { Sun, ShieldCheck, Globe } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AuthGate: React.FC = () => {
  const { signInWithGoogle, lang, setLang } = useApp();

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#14243A] flex items-center justify-center">
              <Sun className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#14243A] leading-tight">ShweSolar ERP</h1>
              <p className="text-xs text-slate-500">
                {lang === 'my' ? 'ဆိုလာအရောင်းဆိုင် စီမံခန့်ခွဲမှုစနစ်' : 'Solar Shop Management & POS'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'my' ? 'en' : 'my')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'my' ? 'EN' : 'မြန်မာ'}</span>
          </button>
        </div>

        <h2 className="text-2xl font-bold text-[#14243A] mb-2">
          {lang === 'my' ? 'စနစ်အတွင်းသို့ ဝင်ရောက်ပါ' : 'Sign in to your workspace'}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-8">
          {lang === 'my'
            ? 'ပစ္စည်းစာရင်း၊ POS အရောင်း၊ အဝယ်၊ နေ့စဉ်/လစဉ် ငွေစာရင်းပိတ်ခြင်းနှင့် အာမခံမှတ်တမ်းများကို တစ်နေရာတည်းတွင် တိကျစွာ စီမံခန့်ခွဲပါ။'
            : 'Manage solar equipment inventory, POS checkout, purchases, cash & bank accounts, daily/monthly closing, quotations, and serial warranties.'}
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 px-5 py-3 text-sm font-semibold text-white bg-[#14243A] hover:bg-[#1e3554] rounded-xl transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#FFFFFF"
              d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
            />
          </svg>
          <span>{lang === 'my' ? 'Google အကောင့်ဖြင့် ဝင်ရောက်ရန်' : 'Continue with Google'}</span>
        </button>

        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            {lang === 'my'
              ? 'Asia/Yangon စံတော်ချိန် · MMK ငွေကြေးစနစ် · စာရင်းစစ်မှတ်တမ်း အပြည့်အစုံ'
              : 'Asia/Yangon Timezone · MMK Accounting Precision · Complete Audit Trail'}
          </span>
        </div>
      </div>
    </div>
  );
};
