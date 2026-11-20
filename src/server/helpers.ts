import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  branches,
  businessSettings,
  categories,
  dailyClosings,
  financialAccounts,
} from '../db/schema.ts';

export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function getYangonToday(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // YYYY-MM-DD
}

export function getYangonMonth(): string {
  return getYangonToday().slice(0, 7); // YYYY-MM
}

export function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toMoney(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(2);
}

export function generateRefNumber(prefix: string): string {
  const datePart = getYangonToday().replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${randomPart}`;
}

export function addMonthsToDate(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1 + months, d || 1));
  return dt.toISOString().slice(0, 10);
}

export async function writeAuditLog(
  tx: DbOrTx,
  params: {
    userId?: string;
    userEmail?: string;
    action: string;
    module: string;
    recordId?: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
) {
  await tx.insert(auditLogs).values({
    userId: params.userId || null,
    userEmail: params.userEmail || '',
    action: params.action,
    module: params.module,
    recordId: params.recordId || '',
    previousValue:
      params.previousValue !== undefined
        ? typeof params.previousValue === 'string'
          ? params.previousValue
          : JSON.stringify(params.previousValue)
        : '',
    newValue:
      params.newValue !== undefined
        ? typeof params.newValue === 'string'
          ? params.newValue
          : JSON.stringify(params.newValue)
        : '',
    reason: params.reason || '',
  });
}

export async function assertDayNotClosed(
  tx: DbOrTx,
  businessDate: string,
  userRole: string
) {
  const existing = await tx
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.businessDate, businessDate), eq(dailyClosings.status, 'closed')))
    .limit(1);

  if (existing.length > 0 && userRole !== 'owner' && userRole !== 'accountant') {
    throw new Error(
      `Business date ${businessDate} is already closed. Reopen with authorized approval before modifying transactions.`
    );
  }
}

export const DEFAULT_SOLAR_CATEGORIES = [
  { name: 'Solar Panels', burmeseName: 'ဆိုလာပြားများ', sortOrder: 1 },
  { name: 'Solar Inverters', burmeseName: 'ဆိုလာ အင်ဗာတာများ', sortOrder: 2 },
  { name: 'Solar Batteries', burmeseName: 'ဆိုလာ ဘက်ထရီများ', sortOrder: 3 },
  { name: 'Charge Controllers', burmeseName: 'အားသွင်းထိန်းချုပ်စက်များ', sortOrder: 4 },
  { name: 'Solar Cables', burmeseName: 'ဆိုလာ ဝါယာကြိုးများ', sortOrder: 5 },
  { name: 'Solar Connectors', burmeseName: 'ဆိုလာ ဆက်သွယ်ခေါင်းများ', sortOrder: 6 },
  { name: 'Mounting Structures', burmeseName: 'ဆိုလာ တပ်ဆင်ဘောင်များ', sortOrder: 7 },
  { name: 'Circuit Breakers', burmeseName: 'ဘရိတ်ကာနှင့် ကာကွယ်ရေးပစ္စည်းများ', sortOrder: 8 },
  { name: 'Distribution Boxes', burmeseName: 'လျှပ်စစ်ဖြန့်ဖြူးရေးဘောက်စ်များ', sortOrder: 9 },
  { name: 'Electrical Accessories', burmeseName: 'လျှပ်စစ်အပိုပစ္စည်းများ', sortOrder: 10 },
  { name: 'Installation Materials', burmeseName: 'တပ်ဆင်ရေးသုံးပစ္စည်းများ', sortOrder: 11 },
  { name: 'Other Accessories', burmeseName: 'အခြားဆက်စပ်ပစ္စည်းများ', sortOrder: 12 },
];

export const DEFAULT_FINANCIAL_ACCOUNTS = [
  { name: 'Main Cash Drawer', accountType: 'cash', bankName: 'Shop Cash', isDefault: true },
  { name: 'KBZPay Business', accountType: 'kbzpay', bankName: 'KBZ Bank', isDefault: false },
  { name: 'WavePay Merchant', accountType: 'wavepay', bankName: 'Wave Money', isDefault: false },
  { name: 'KBZ Bank Account', accountType: 'bank', bankName: 'Kanbawza Bank', isDefault: false },
  { name: 'AYA Bank Account', accountType: 'bank', bankName: 'Ayeyarwady Bank', isDefault: false },
];

export async function ensureSystemDefaults() {
  try {
    // 1. Default Branch
    const existingBranches = await db.select().from(branches).limit(1);
    if (existingBranches.length === 0) {
      await db
        .insert(branches)
        .values({
          name: 'Yangon Main Showroom',
          code: 'YGN-HQ',
          address: 'No. 42, Pyay Road, Hlaing Township, Yangon',
          phone: '09-795-412-880',
          isDefault: true,
        })
        .onConflictDoNothing();
    }

    // 2. Default Business Settings
    const existingSettings = await db.select().from(businessSettings).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(businessSettings).values({});
    }

    // 3. Default Solar Categories
    const existingCats = await db.select().from(categories).limit(1);
    if (existingCats.length === 0) {
      for (const cat of DEFAULT_SOLAR_CATEGORIES) {
        await db.insert(categories).values(cat).onConflictDoNothing();
      }
    }

    // 4. Default Financial Accounts (with 0 opening balance — never fabricated!)
    const existingAccounts = await db.select().from(financialAccounts).limit(1);
    if (existingAccounts.length === 0) {
      for (const acc of DEFAULT_FINANCIAL_ACCOUNTS) {
        await db.insert(financialAccounts).values({
          name: acc.name,
          accountType: acc.accountType,
          bankName: acc.bankName,
          openingBalance: '0.00',
          currentBalance: '0.00',
          isDefault: acc.isDefault,
        });
      }
    }
  } catch (error) {
    console.error('Failed to ensure system defaults:', error);
    throw new Error('Unable to initialize system configuration.', { cause: error });
  }
}
