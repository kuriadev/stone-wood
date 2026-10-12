// ── Upkeep schedule, cleaning supplies and stock history
//
// The records behind the caretakers' My Tasks screen and the self-updating
// inventory (20261012130000_tasks_and_stock_movements.sql).

/** "Uses 2 of item 7" — a standard amount a task pre-fills. */
export interface SupplyLine {
  itemId: number;
  qty: number;
}

/** Repeating work the owner schedules once: "Pool cleaning, every 7 days". */
export interface UpkeepTask {
  id: number;
  title: string;
  facilityId: number | null;
  everyDays: number;
  /** The first day it is due, YYYY-MM-DD. */
  startDate: string;
  notes: string;
  active: boolean;
  supplies: SupplyLine[];
}

/** One time an upkeep task was done, for one scheduled day. */
export interface UpkeepRun {
  id: number;
  taskId: number;
  dueDate: string;
  doneAt: string;
  doneByName: string | null;
  note: string;
}

export type MovementReason = "Used" | "Broken" | "Bought" | "Counted" | "Adjusted";

/** One line of an item's stock history. */
export interface StockMovement {
  id: number;
  itemId: number;
  delta: number;
  reason: MovementReason;
  refType: string | null;
  refId: string | null;
  bookingId: string | null;
  unitCost: number | null;
  expenseId: number | null;
  staffName: string | null;
  note: string;
  at: string;
}

/** Everything My Tasks needs besides bookings, facilities and inspections. */
export interface UpkeepData {
  tasks: UpkeepTask[];
  /** The last few weeks of runs, to tell what is already done. */
  runs: UpkeepRun[];
  /** facilityId → what cleaning it uses. */
  cleaningSupplies: Record<number, SupplyLine[]>;
  /** False before the stock migration: no schedule, manual stock only. */
  enabled: boolean;
}
