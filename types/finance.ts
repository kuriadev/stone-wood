// ── Sales ledger and facility operations
//
// UI shapes (camelCase). The matching database rows are in types/database.ts
// and the mappers in lib/supabase.ts, same as every other table.

export type PaymentType = "Downpayment" | "Balance" | "Full" | "Penalty" | "Refund";
export type PaymentMethod = "PayMongo" | "Cash" | "GCash" | "Bank Transfer";

export const PAYMENT_TYPES: PaymentType[] = ["Downpayment", "Balance", "Full", "Penalty", "Refund"];
export const PAYMENT_METHODS: PaymentMethod[] = ["PayMongo", "Cash", "GCash", "Bank Transfer"];
/** Methods staff can pick by hand. PayMongo payments only ever come from
 *  the online checkout, never from the admin form. */
export const MANUAL_METHODS: Exclude<PaymentMethod, "PayMongo">[] = ["Cash", "GCash", "Bank Transfer"];

export interface Payment {
  id: number;
  bookingId: string | null;
  guestName: string;
  type: PaymentType;
  method: PaymentMethod;
  /** Always positive; a Refund is subtracted when totals are computed. */
  amount: number;
  reference: string;
  notes: string;
  receivedAt: string;
  voided: boolean;
  voidReason?: string;
  voidedAt?: string;
}

export type ExpenseCategory = "Utilities" | "Supplies" | "Repairs" | "Salaries" | "Pool Maintenance" | "Other";
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Utilities", "Supplies", "Repairs", "Salaries", "Pool Maintenance", "Other"];

export interface Expense {
  id: number;
  category: ExpenseCategory;
  description: string;
  amount: number;
  method: Exclude<PaymentMethod, "PayMongo">;
  spentOn: string;
  voided: boolean;
  voidReason?: string;
}

export interface DailyClosing {
  closingDate: string;
  openingFloat: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  totalCollected: number;
  totalExpenses: number;
  notes: string;
  closedAt: string;
}

export interface DamageRate {
  id: number;
  name: string;
  category: string;
  unit: string;
  rate: number;
  active: boolean;
}

export type InspectionStage = "Preparation" | "Checkout";

export interface InspectionItem {
  facilityId: number;
  facilityName: string;
  checklist: { label: string; done: boolean }[];
  condition: "OK" | "Damaged";
}

export interface Inspection {
  id: number;
  bookingId: string;
  stage: InspectionStage;
  items: InspectionItem[];
  notes: string;
  inspectedAt: string;
}

export interface DamageRecord {
  id: number;
  bookingId: string;
  inspectionId: number | null;
  facilityName: string;
  rateId: number | null;
  itemName: string;
  quantity: number;
  unitRate: number;
  adjustment: number;
  adjustmentReason: string;
  amount: number;
  description: string;
  voided: boolean;
}

/** Everything the Sales and Facilities modules read, loaded in one request. */
export interface OpsData {
  payments: Payment[];
  expenses: Expense[];
  closings: DailyClosing[];
  damageRates: DamageRate[];
  inspections: Inspection[];
  damages: DamageRecord[];
}
