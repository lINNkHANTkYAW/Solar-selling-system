import React, { useState } from 'react';
import { Sun, Check, ArrowRight, ArrowLeft, Database } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';

export const OnboardingWizard: React.FC = () => {
  const { lang, bootstrap, refreshBootstrap, notify } = useApp();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [shopName, setShopName] = useState(bootstrap?.settings?.shopName || 'ShweSolar Energy & Equipment');
  const [burmeseName, setBurmeseName] = useState(
    bootstrap?.settings?.burmeseName || 'ရွှေဆိုလာ စွမ်းအင်နှင့် ပစ္စည်းအရောင်းဆိုင်'
  );
  const [address, setAddress] = useState(
    bootstrap?.settings?.address || 'No. 42, Pyay Road, Hlaing Township, Yangon'
  );
  const [phone, setPhone] = useState(bootstrap?.settings?.phone || '09-795-412-880');
  const [email, setEmail] = useState(bootstrap?.settings?.email || 'sales@shwesolar.mm');
  const [currency, setCurrency] = useState('MMK');

  const [openingCashBalance, setOpeningCashBalance] = useState('0');
  const [openingBankBalance, setOpeningBankBalance] = useState('0');

  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodSell, setProdSell] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [loadDemo, setLoadDemo] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/onboarding/complete', {
        method: 'POST',
        body: {
          shopName,
          burmeseName,
          address,
          phone,
          email,
          currency,
          defaultLanguage: lang,
          openingCashBalance: Number(openingCashBalance || 0),
          openingBankBalance: Number(openingBankBalance || 0),
          initialSupplier: supName.trim() ? { name: supName.trim(), phone: supPhone.trim() } : null,
          initialProduct:
            prodName.trim() && prodSku.trim()
              ? {
                  sku: prodSku.trim(),
                  name: prodName.trim(),
                  purchasePrice: Number(prodCost || 0),
                  sellingPrice: Number(prodSell || 0),
                  openingStock: Number(prodStock || 0),
                }
              : null,
          loadDemo,
        },
      });
      await refreshBootstrap();
      notify(
        'success',
        lang === 'my' ? 'ဆိုင်စနစ် စတင်သတ်မှတ်ပြီးပါပြီ။' : 'Shop setup completed successfully.'
      );
    } catch (error: any) {
      notify('error', error.message || 'Failed to save setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-[#14243A] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <Sun className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-base font-bold">
                {lang === 'my' ? 'ဆိုလာအရောင်းဆိုင် စတင်သတ်မှတ်ခြင်း' : 'Initial Solar Shop Setup Wizard'}
              </h1>
              <p className="text-xs text-slate-300">
                {lang === 'my' ? `အဆင့် ${step} / 3` : `Step ${step} of 3`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 w-8 rounded-full ${n <= step ? 'bg-[#F59E0B]' : 'bg-white/20'}`}
              />
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#14243A]">
                {lang === 'my' ? '၁။ ဆိုင်အချက်အလက်နှင့် ငွေကြေးသတ်မှတ်ရန်' : '1. Shop Identity & Currency'}
              </h2>
              <p className="text-sm text-slate-500">
                {lang === 'my'
                  ? 'ဤအချက်အလက်များကို အရောင်းဘောက်ချာ (A4 / Thermal) နှင့် ဈေးနှုန်းလွှာများတွင် ဖော်ပြပါမည်။'
                  : 'These details appear on all A4 invoices, 80mm thermal receipts, and customer quotations.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Name (English)</label>
                  <input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ဆိုင်အမည် (မြန်မာ)</label>
                  <input
                    value={burmeseName}
                    onChange={(e) => setBurmeseName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Default Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="MMK">MMK — Myanmar Kyat (Ks)</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="THB">THB — Thai Baht</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Address</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#14243A]">
                {lang === 'my' ? '၂။ စတင်လက်ကျန်ငွေနှင့် ငွေစာရင်းများ' : '2. Opening Cash & Bank Balances'}
              </h2>
              <p className="text-sm text-slate-500">
                {lang === 'my'
                  ? 'Main Cash, KBZPay, WavePay, KBZ Bank နှင့် AYA Bank အကောင့်များကို အလိုအလျောက် ဖန်တီးပေးထားပါသည်။ စတင်လက်ကျန်ငွေရှိပါက ထည့်သွင်းနိုင်ပါသည်။'
                  : 'Default accounts (Main Cash, KBZPay, WavePay, KBZ Bank, AYA Bank) and 12 Solar Categories are pre-configured with zero fabricated transactions.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Cash Drawer ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={openingCashBalance}
                    onChange={(e) => setOpeningCashBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Opening Bank Balance ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={openingBankBalance}
                    onChange={(e) => setOpeningBankBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    First Supplier Name (Optional)
                  </label>
                  <input
                    placeholder="e.g. Yangon Solar Wholesale"
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Phone (Optional)
                  </label>
                  <input
                    placeholder="09-..."
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-[#14243A]">
                {lang === 'my'
                  ? '၃။ ပထမဆုံး ပစ္စည်းထည့်သွင်းခြင်း (သို့) နမူနာဒေတာ စမ်းသပ်ခြင်း'
                  : '3. Initial Inventory or Optional Demo Dataset'}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product SKU (Optional)</label>
                  <input
                    placeholder="SP-550W-01"
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name (Optional)</label>
                  <input
                    placeholder="LONGi 550W Solar Panel"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Price ({currency})</label>
                  <input
                    type="number"
                    placeholder="310000"
                    value={prodCost}
                    onChange={(e) => setProdCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price ({currency})</label>
                  <input
                    type="number"
                    placeholder="385000"
                    value={prodSell}
                    onChange={(e) => setProdSell(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Stock Qty</label>
                  <input
                    type="number"
                    placeholder="10"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={loadDemo}
                  onChange={(e) => setLoadDemo(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-[#F59E0B]"
                />
                <div className="text-sm">
                  <div className="font-semibold text-[#14243A] flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-amber-600" />
                    <span>
                      {lang === 'my'
                        ? 'နမူနာဒေတာများ (Demo Data) ထည့်သွင်းစမ်းသပ်မည်'
                        : 'Load Clearly Labeled Myanmar Solar Shop Demo Data'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {lang === 'my'
                      ? '550W ဆိုလာပြား၊ 5kW အင်ဗာတာ၊ 48V ဘက်ထရီ၊ 5kW ပက်ကေ့ချ်၊ အရောင်း/အဝယ် နမူနာများကို စမ်းသပ်ကြည့်နိုင်ပြီး Settings မှ အချိန်မရွေး လုံခြုံစွာ ဖျက်ထုတ်နိုင်ပါသည်။'
                      : 'Populates sample solar panels, inverters, batteries, 5kW package, invoices, and warranty records tagged as Demo Data. You can safely delete all demo data in one click anytime.'}
                  </p>
                </div>
              </label>
            </div>
          )}

          <div className="mt-8 pt-5 border-t border-slate-200 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors"
              >
                <span>{lang === 'my' ? 'ရှေ့ဆက်ရန်' : 'Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleFinish}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#14243A] hover:bg-[#1e3554] rounded-lg transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Setting up...'
                    : lang === 'my'
                      ? 'စနစ်စတင်အသုံးပြုရန်'
                      : 'Launch Solar ERP'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
