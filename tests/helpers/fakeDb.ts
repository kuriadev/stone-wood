/**
 * Minimal in-memory stand-in for the slice of supabase-js the API routes use:
 * from().select/insert/update/delete + eq/neq/is/in/not/gt/gte/lt/lte/order/limit
 * + single/maybeSingle, awaitable at any point in the chain.
 *
 * It is NOT Postgres: it does not enforce unique indexes or triggers, so tests
 * that depend on those (e.g. one-payment-one-booking) assert the route's own
 * pre-check, not the DB constraint.
 */
type Row = Record<string, any>;
type Filter = (r: Row) => boolean;
type Result = { data: any; error: { message: string; code?: string } | null };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  private seq: Record<string, number> = {};
  /** Force an error for `${table}.${op}` (op = select|insert|update|delete). */
  failures: Record<string, { message: string; code?: string }> = {};
  /** Column defaults the real schema applies on insert. */
  defaults: Record<string, Row> = { payments: { voided: false }, inventory: { deleted_at: null } };
  log: { table: string; op: string; payload?: any }[] = [];

  seed(table: string, rows: Row[]) { this.tables[table] = rows.map((r) => ({ ...r })); return this; }
  rows(table: string) { return this.tables[table] ?? []; }
  from(table: string) { return new Query(this, table); }
  nextId(table: string) { this.seq[table] = (this.seq[table] ?? 1000) + 1; return this.seq[table]; }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private payload: any;
  private wantRows = false;
  private mode: "many" | "single" | "maybe" = "many";
  private orderBy?: { col: string; asc: boolean };
  private max?: number;

  constructor(private db: FakeDb, private table: string) {}

  private cols?: string[];
  /** Honours a plain column list (as PostgREST does); "*" and embedded joins return whole rows. */
  select(cols?: string) {
    this.wantRows = true;
    if (cols && cols !== "*" && !cols.includes("(") && !cols.includes("*")) this.cols = cols.split(",").map((c) => c.trim());
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }

  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  not(c: string, operator: string, v: any) {
    if (operator === "in") {
      const set = String(v).replace(/[()]/g, "").split(",").map((s) => s.trim());
      this.filters.push((r) => !set.includes(String(r[c])));
    } else if (operator === "is") {
      this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v));
    } else throw new Error(`FakeDb: unsupported not(${operator})`);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private run(): Result {
    const { db, table } = this;
    db.log.push({ table, op: this.op, payload: this.payload });
    const fail = db.failures[`${table}.${this.op}`];
    if (fail) return { data: null, error: fail };
    const t = (db.tables[table] ??= []);
    let out: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      out = list.map((p) => {
        const row = { ...(db.defaults[table] ?? {}), ...p };
        if (row.id === undefined || row.id === "") {
          row.id = table === "bookings" ? `SW-${String(db.nextId(table)).padStart(5, "0")}` : db.nextId(table);
        }
        row.created_at ??= new Date().toISOString();
        t.push(row);
        return row;
      });
    } else if (this.op === "update") {
      out = t.filter((r) => this.filters.every((f) => f(r)));
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      out = t.filter((r) => this.filters.every((f) => f(r)));
      db.tables[table] = t.filter((r) => !out.includes(r));
    } else {
      out = t.filter((r) => this.filters.every((f) => f(r)));
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (this.max !== undefined) out = out.slice(0, this.max);
    const writes = this.op === "insert" || this.op === "update" || this.op === "delete";
    if (writes && !this.wantRows) return { data: null, error: null };
    const pick = (r: Row) => (this.cols ? Object.fromEntries(this.cols.map((c) => [c, r[c]])) : { ...r });
    const copy = out.map(pick);
    if (this.mode === "many") return { data: copy, error: null };
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    return copy.length === 1
      ? { data: copy[0], error: null }
      : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}
