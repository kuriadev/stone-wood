// ── Sales ledger and facility operations
//
// UI shapes (camelCase). The matching database rows are in types/database.ts
// and the mappers in lib/supabase.ts, same as every other table.

export type PaymentType = "Downpayment" | "Balance" | "Full" | "Penalty" | "Refund";
export type PaymentMethod = "PayMongo" | "Cash" | "GCash";

export const PAYMENT_TYPES: PaymentType[] = ["Downpayment", "Balance", "Full", "Penalty", "Refund"];
export const PAYMENT_METHODS: PaymentMethod[] = ["PayMongo", "Cash", "GCash"];
/** Methods staff can pick by hand. PayMongo payments only ever come from
 *  the online checkout, never from the admin form.
 *
 *  The resort takes money exactly two ways: cash, and QR Ph — the online
 *  checkout (stored as "PayMongo") or a QR Ph code scanned at the desk
 *  (stored as "GCash", the value older rows and the database already use).
 *  Every screen shows the stored "GCash" as "QR Ph" (lib/labels.ts). There
 *  are no bank transfers or other methods. */
export const MANUAL_METHODS: Exclude<PaymentMethod, "PayMongo">[] = ["Cash", "GCash"];

/** What the front desk can take from a guest standing there: cash, or a
 *  QR Ph code the guest scans. */
/** The most one expense can be: up to the millions (₱999,999,999.99). The
 *  database column holds it after 20261110120000_expense_amount_millions. */
export const EXPENSE_MAX = 999_999_999.99;

export const DESK_METHODS: Exclude<PaymentMethod, "PayMongo">[] = ["Cash", "GCash"];

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
  /** When it was entered (the timestamp shown beside the date). */
  recordedAt?: string;
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
  /** Breakage of this item also comes off this inventory item's count. */
  inventoryItemId?: number | null;
}

export type InspectionStage = "Preparation" | "Checkout";

/** A photo a caretaker took at an inspection — evidence, not analysed. */
export interface InspectionPhoto {
  facilityId: number;
  /** A compressed data URL, stored like room and receipt photos. */
  src: string;
}

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
  photos?: InspectionPhoto[];
  /** The staff member who did it (after the stock migration). */
  inspectedByName?: string;
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
  /** Guest date-change requests: every pending one, plus recent history. */
  dateChanges: DateChange[];
  /** Requests to the owner: all of them for the owner, your own otherwise.
   *  Empty before the staff migration. */
  requests: import("@/types/admin").OwnerRequest[];
}

export interface DateChange {
  id: number;
  bookingId: string;
  fromDate: string;
  toDate: string;
  requestedBy: "Guest" | "Resort";
  status: "Pending" | "Approved" | "Declined" | "Expired";
  /** Pending guest requests hold the new date until this time (ISO). */
  holdUntil?: string;
  decidedAt?: string;
  note: string;
  createdAt: string;
}

export interface Activity {
  id: number;
  at: string;
  actor: "Admin" | "Guest" | "System";
  action: string;
  entity: string;
  entityId: string;
  bookingId?: string;
  summary: string;
  details: Record<string, unknown>;
  /** The staff member who did it, for Admin lines written after staff
   *  accounts existed. Older lines have none and read as "Admin". */
  staffId?: string;
  staffName?: string;
}
