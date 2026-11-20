import React, { useState } from 'react';
import { Printer, FileText, Receipt } from 'lucide-react';
import { Modal } from './ui/CommonUI';
import { useApp } from '../context/AppContext';
import { formatDateDDMMYYYY, formatMMK } from '../lib/i18n';

export const ReceiptModal: React.FC<{
  open: boolean;
  onClose: () => void;
  sale: any | null;
}> = ({ open, onClose, sale }) => {
  const { bootstrap, lang } = useApp();
  const [layout, setLayout] = useState<'a4' | 'thermal'>('a4');

  if (!open || !sale) return null;
  const settings = bootstrap?.settings || {};
  const currency = settings.currency || 'MMK';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lang === 'my' ? `အရောင်းဘောက်ချာ — ${sale.invoiceNumber}` : `Sales Invoice — ${sale.invoiceNumber}`}
      size="xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-200 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setLayout('a4')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              layout === 'a4' ? 'bg-white text-[#14243A] shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>A4 Standard Invoice</span>
          </button>
          <button
            type="button"
            onClick={() => setLayout('thermal')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              layout === 'thermal' ? 'bg-white text-[#14243A] shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>80mm Thermal Receipt</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#14243A] hover:bg-[#1e3554] rounded-lg transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span>{lang === 'my' ? 'ပရင့်ထုတ်ရန် / PDF သိမ်းရန်' : 'Print / Save PDF'}</span>
        </button>
      </div>

      <div id="printable-receipt-area" className="flex justify-center">
        {layout === 'a4' ? (
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-lg p-8 text-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
              <div>
                <h2 className="text-xl font-bold text-[#14243A]">{settings.shopName || 'ShweSolar Energy'}</h2>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{settings.burmeseName}</p>
                <p className="text-xs text-slate-500 mt-1">{settings.address}</p>
                <p className="text-xs text-slate-500">
                  Tel: {settings.phone} · {settings.email}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-[#14243A]">SALES INVOICE</div>
                <div className="font-mono-num text-sm font-semibold text-blue-700 mt-1">
                  {sale.invoiceNumber}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Date: {formatDateDDMMYYYY(sale.saleDate)}
                </div>
                <div className="text-xs text-slate-500">Payment: {sale.paymentMethod}</div>
              </div>
            </div>

            <div className="py-4 flex items-center justify-between text-sm border-b border-slate-100">
              <div>
                <span className="text-xs text-slate-500 block">Billed To / ဝယ်ယူသူ</span>
                <span className="font-semibold text-[#14243A]">{sale.customerName}</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Status</span>
                <span className="font-semibold capitalize">{String(sale.status).replace('_', ' ')}</span>
              </div>
            </div>

            <table className="w-full text-sm my-4 border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-xs text-slate-600">
                  <th className="py-2 text-left">Item / ပစ္စည်းအမည်</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit Price</th>
                  <th className="py-2 text-right">Discount</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sale.items || []).map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-900">{item.productName}</div>
                      {item.burmeseName && item.burmeseName !== item.productName && (
                        <div className="text-xs text-slate-500">{item.burmeseName}</div>
                      )}
                      {(item.warrantyMonths > 0 || item.serialNumbers) && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.warrantyMonths > 0 ? `Warranty: ${item.warrantyMonths} Months` : ''}
                          {item.serialNumbers ? ` · S/N: ${item.serialNumbers}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-mono-num">{Number(item.quantity)}</td>
                    <td className="py-2.5 text-right font-mono-num">{formatMMK(item.unitPrice, '')}</td>
                    <td className="py-2.5 text-right font-mono-num">{formatMMK(item.discountAmount || 0, '')}</td>
                    <td className="py-2.5 text-right font-mono-num font-semibold">
                      {formatMMK(item.lineTotal, '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-slate-200 pt-4 flex justify-end">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono-num">{formatMMK(sale.subtotal, currency)}</span>
                </div>
                {(Number(sale.itemDiscountTotal) > 0 || Number(sale.overallDiscount) > 0) && (
                  <div className="flex justify-between text-slate-600">
                    <span>Total Discounts</span>
                    <span className="font-mono-num">
                      -{formatMMK(Number(sale.itemDiscountTotal || 0) + Number(sale.overallDiscount || 0), currency)}
                    </span>
                  </div>
                )}
                {Number(sale.additionalCharges) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Installation / Charges</span>
                    <span className="font-mono-num">{formatMMK(sale.additionalCharges, currency)}</span>
                  </div>
                )}
                {Number(sale.taxAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <span className="font-mono-num">{formatMMK(sale.taxAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-[#14243A] border-t border-slate-300 pt-2">
                  <span>Grand Total</span>
                  <span className="font-mono-num">{formatMMK(sale.grandTotal, currency)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Paid Amount</span>
                  <span className="font-mono-num">{formatMMK(sale.paidAmount, currency)}</span>
                </div>
                {Number(sale.outstandingAmount) > 0 && (
                  <div className="flex justify-between text-red-700 font-semibold">
                    <span>Remaining Balance</span>
                    <span className="font-mono-num">{formatMMK(sale.outstandingAmount, currency)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
              {settings.receiptFooter}
            </div>
          </div>
        ) : (
          <div className="w-[320px] bg-white border border-slate-300 p-4 font-mono text-xs text-slate-900">
            <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
              <div className="font-bold text-sm">{settings.shopName}</div>
              <div className="text-[11px]">{settings.burmeseName}</div>
              <div className="text-[10px] text-slate-600 mt-1">{settings.address}</div>
              <div className="text-[10px] text-slate-600">Tel: {settings.phone}</div>
            </div>

            <div className="space-y-0.5 text-[11px] mb-3">
              <div className="flex justify-between">
                <span>Inv:</span>
                <span className="font-bold">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{formatDateDDMMYYYY(sale.saleDate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cust:</span>
                <span className="truncate max-w-[180px]">{sale.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Pay:</span>
                <span>{sale.paymentMethod}</span>
              </div>
            </div>

            <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-2">
              {(sale.items || []).map((item: any, idx: number) => (
                <div key={idx}>
                  <div className="font-semibold">{item.productName}</div>
                  <div className="flex justify-between text-[11px]">
                    <span>
                      {Number(item.quantity)} x {formatMMK(item.unitPrice, '')}
                    </span>
                    <span className="font-semibold">{formatMMK(item.lineTotal, '')}</span>
                  </div>
                  {item.warrantyMonths > 0 && (
                    <div className="text-[10px] text-slate-600">
                      Warranty: {item.warrantyMonths}m {item.serialNumbers ? `(${item.serialNumbers})` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="py-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatMMK(sale.subtotal, '')}</span>
              </div>
              {Number(sale.overallDiscount) + Number(sale.itemDiscountTotal || 0) > 0 && (
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>-{formatMMK(Number(sale.overallDiscount) + Number(sale.itemDiscountTotal || 0), '')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs border-t border-slate-300 pt-1">
                <span>TOTAL ({currency}):</span>
                <span>{formatMMK(sale.grandTotal, '')}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid:</span>
                <span>{formatMMK(sale.paidAmount, '')}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Balance:</span>
                <span>{formatMMK(sale.outstandingAmount, '')}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-slate-400 pt-3 mt-2 text-center text-[10px] text-slate-600">
              {settings.receiptFooter}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
