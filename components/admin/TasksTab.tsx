"use client";

/* My Tasks — the caretakers' screen (and the owner's, when they pitch in).
 *
 * Nobody writes this list. It is worked out from what the system already
 * knows (lib/tasks.ts): groups on site need a check-out inspection as they
 * leave, tomorrow's and today's arrivals need their facilities prepared,
 * what a check-out left behind needs cleaning, and the owner's upkeep
 * schedule says what is due. Doing the work — saving the inspection, the
 * preparation, the cleaning, the upkeep run — is what takes it off the
 * list, for everyone at once.
 *
 * Laid out like the Dashboard: a count per kind of work, then one section
 * per kind with a card per task and the one button that starts it. On a
 * phone the cards stack in a single column.
 *
 * Finishing a cleaning or an upkeep task asks what was used, pre-filled with
 * the standard amounts, and that is what keeps the stock count true without
 * anyone counting chlorine after every pool cleaning.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useToast } from "@/contexts/ToastContext";
import { useStaff } from "@/contexts/StaffContext";
import { OwnerTasks } from "@/components/admin/OwnerTasks";
import { FrontDeskTasks } from "@/components/admin/FrontDeskTasks";
import type { AdminTab } from "@/types/admin";
import { AdminPageHeader, ActionButton, Label, Modal, ErrorNote, StatCard, StatusBadge, useAdminStyle } from "@/components/admin/ui";
import { PrepModal, CheckoutModal } from "@/components/admin/InspectionModals";
import { SupplyLines, SupplySummary, nonZero } from "@/components/admin/SupplyLines";
import { Textarea } from "@/components/ui/textarea";
import { Icon, type IconName } from "@/components/common/Icon";
import { caretakerTasks, upcomingUpkeep, addDaysIso, type CaretakerTask, type TaskKind } from "@/lib/tasks";
import { manilaDate } from "@/lib/finance";
import { fmtDate, getBookingSlot } from "@/lib/utils";
import { SLOTS } from "@/lib/resort";
import { prepBlocked, prepOpensOn, clockTime } from "@/lib/operations";
import type { Facility } from "@/types/facility";
import type { InventoryItem } from "@/types/inventory";
import type { SupplyLine, UpkeepData } from "@/types/tasks";

const KIND: Record<TaskKind, { section: string; hint: string; stat: string; icon: IconName; color: string; verb: string; verbIcon: IconName }> = {
  inspect: { section: "Groups leaving", hint: "Inspect what they used as they go. Damage goes on their bill.", stat: "To inspect", icon: "search", color: "#d4644a", verb: "Inspect", verbIcon: "clipboard-check" },
  prepare: { section: "Arrivals", hint: "Get their facilities ready. Opens the day before they arrive.", stat: "To prepare", icon: "clipboard", color: "#3a8fc4", verb: "Prepare", verbIcon: "clipboard-check" },
  clean: { section: "To clean", hint: "Left by a check-out. Confirm what you used when you're done.", stat: "To clean", icon: "toolbox", color: "#d4a800", verb: "Mark cleaned", verbIcon: "check" },
  upkeep: { section: "Upkeep", hint: "The super admin's schedule. Its supplies come off the stock when you finish.", stat: "Upkeep due", icon: "refresh", color: "#2e9e4e", verb: "Done", verbIcon: "check" },
};
const ORDER: TaskKind[] = ["inspect", "prepare", "clean", "upkeep"];

const EMPTY: UpkeepData = { tasks: [], runs: [], cleaningSupplies: {}, enabled: false };

/** "6 amenities · Room 1" — the Dashboard's short form, not every name. */
function usesText(list: Facility[]): string {
  const rooms = list.filter((f) => f.category === "Room").map((f) => f.name.split(" –")[0]);
  const amenities = list.filter((f) => f.category === "Amenity").length;
  return [amenities ? `${amenities} amenit${amenities === 1 ? "y" : "ies"}` : "", ...rooms].filter(Boolean).join(" · ") || "No listed facilities";
}

/** Each role sees its own work: the owner what only they can settle
 *  (OwnerTasks), front desk the counter and the money (FrontDeskTasks), a
 *  caretaker the facilities. */
export function TasksTab({ mob, onGoTab, onOpenBooking }: {
  mob: boolean;
  onGoTab?: (t: AdminTab) => void;
  onOpenBooking?: (id: string) => void;
}) {
  const role = useStaff().me?.role ?? "Owner";
  if (role === "Owner") return <OwnerTasks mob={mob} onGoTab={onGoTab} onOpenBooking={onOpenBooking} />;
  if (role === "FrontDesk") return <FrontDeskTasks mob={mob} onGoTab={onGoTab} />;
  return <CaretakerTasks mob={mob} />;
}

function CaretakerTasks({ mob }: { mob: boolean }) {
  const { C, cBr, cBg, soft } = useAdminStyle();
  const { bookings, facilities, inventory, reloadFacilities, reloadInventory } = useApp();
  const ops = useOps();
  const [upkeep, setUpkeep] = useState<UpkeepData>(EMPTY);
  const [open, setOpen] = useState<CaretakerTask | null>(null);

  const loadUpkeep = useCallback(async () => {
    try {
      const res = await fetch("/api/upkeep", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success) setUpkeep({ tasks: json.tasks ?? [], runs: json.runs ?? [], cleaningSupplies: json.cleaningSupplies ?? {}, enabled: !!json.enabled });
    } catch { /* keep what is on screen; the next sync tries again */ }
  }, []);
  // Along with the panel's own live sync, so a task someone else finished
  // drops off this phone too.
  useEffect(() => { void loadUpkeep(); }, [loadUpkeep, ops.live.syncedAt]);

  const today = manilaDate();
  const tomorrow = addDaysIso(today, 1);
  const tasks = useMemo(() => caretakerTasks({
    bookings, facilities, inspections: ops.inspections, upkeep: upkeep.tasks, runs: upkeep.runs, today,
  }), [bookings, facilities, ops.inspections, upkeep, today]);
  const byKind = (k: TaskKind) => tasks.filter((t) => t.kind === k);

  // Coming up: preparations that open in the next few days (not ones
  // already on the list), and upkeep in the next week.
  const listed = new Set(tasks.map((t) => t.booking?.id).filter(Boolean));
  const prepSoon = bookings
    .filter((b) => (b.status === "Confirmed" || b.status === "Pending") && !b.archived && !listed.has(b.id) &&
      !b.checkedInAt && !ops.inspections.some((i) => i.stage === "Preparation" && i.bookingId === b.id) &&
      !!prepBlocked(b, today) && b.date > tomorrow && b.date <= addDaysIso(today, 4))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upkeepSoon = upcomingUpkeep(upkeep.tasks, upkeep.runs, today, 7);
  const comingUp = [
    ...prepSoon.map((b) => ({ key: `p-${b.id}`, date: prepOpensOn(b), text: `Prepare for ${b.name}`, sub: `arrives ${fmtDate(b.date)}` })),
    ...upkeepSoon.map(({ task, date }) => ({ key: `u-${task.id}-${date}`, date, text: task.title, sub: `every ${task.everyDays === 1 ? "day" : `${task.everyDays} days`}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const done = async () => {
    setOpen(null);
    await Promise.all([ops.refresh(), reloadFacilities(), reloadInventory(), loadUpkeep()]);
  };

  /** A group whose booked time is over: inspect now. */
  const timeUp = (t: CaretakerTask) => t.kind === "inspect" && !!t.endsAt && Date.now() >= t.endsAt.getTime();

  /** The badge that says how pressing it is. */
  const when = (t: CaretakerTask) => {
    if (t.overdue) return <StatusBadge color="#d44">{t.kind === "upkeep" ? `Late · was ${fmtDate(t.date)}` : "Overdue"}</StatusBadge>;
    if (timeUp(t)) return <StatusBadge color="#d44">Time&apos;s up · inspect now</StatusBadge>;
    if (t.kind === "inspect") return <StatusBadge color="#2e9e4e">{t.endsAt ? `On site · out ${clockTime(t.endsAt)}` : "On site"}</StatusBadge>;
    if (t.kind === "prepare") return t.date === today ? <StatusBadge color="#d4a800">Today</StatusBadge> : <StatusBadge color="#3a8fc4">Tomorrow</StatusBadge>;
    return <StatusBadge color="#d4a800">Today</StatusBadge>;
  };

  const card = (t: CaretakerTask) => {
    const k = KIND[t.kind];
    const b = t.booking;
    const slot = b ? SLOTS[getBookingSlot(b)] : null;
    const title = b ? b.name : t.kind === "clean" ? t.facilities[0]?.name ?? t.title : t.title;
    const edge = t.overdue || timeUp(t) ? "#d4444066" : cBr;
    return (
      <article key={t.key} aria-label={`${k.verb}: ${title}`}
        style={{ background: cBg, borderTop: `1px solid ${edge}`, borderRight: `1px solid ${edge}`, borderBottom: `1px solid ${edge}`, borderLeft: `3px solid ${k.color}`, borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
            <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `${k.color}1f`, color: k.color }}>
              <Icon name={k.icon} size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.textH, fontWeight: 600, fontSize: 15, overflowWrap: "anywhere" }}>{title}</div>
              {b && slot && (
                <div style={{ color: C.textS, fontSize: 12, marginTop: 3 }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.textXS }}>{b.id}</span> · {slot.label} ({slot.hours}){b.arrivalTime ? ` · arrives ${b.arrivalTime}` : ""}
                </div>
              )}
              {t.kind === "clean" && <div style={{ color: C.textS, fontSize: 12, marginTop: 3 }}>{t.detail}</div>}
              {t.kind === "upkeep" && t.facilities[0] && <div style={{ color: C.textS, fontSize: 12, marginTop: 3 }}>{t.facilities[0].name}</div>}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>{when(t)}</div>
        </div>

        <div style={{ color: C.textB, fontSize: 12.5, lineHeight: 1.6 }}>
          {b && <div><Icon name="users" size={12} style={{ marginRight: 8, verticalAlign: -1 }} />{b.guests} guest{b.guests === 1 ? "" : "s"}</div>}
          {(t.kind === "prepare" || t.kind === "inspect") && (
            <div style={{ color: C.textS }} title={t.facilities.map((f) => f.name).join(", ")}>
              <Icon name="toolbox" size={12} style={{ marginRight: 8, verticalAlign: -1 }} />{usesText(t.facilities)}
            </div>
          )}
          {t.kind === "clean" && (
            <div style={{ color: C.textS }}><Icon name="package" size={12} style={{ marginRight: 8, verticalAlign: -1 }} />
              <SupplySummary lines={upkeep.cleaningSupplies[t.facilities[0]?.id] ?? []} inventory={inventory} />
            </div>
          )}
          {t.kind === "upkeep" && t.upkeep && (
            <div style={{ color: C.textS }}><Icon name="package" size={12} style={{ marginRight: 8, verticalAlign: -1 }} />
              <SupplySummary lines={t.upkeep.supplies} inventory={inventory} />
            </div>
          )}
        </div>

        <div style={{ display: "grid" }}>
          <ActionButton kind="primary" icon={k.verbIcon} onClick={() => setOpen(t)}>{k.verb}</ActionButton>
        </div>
      </article>
    );
  };

  return (
    <div>
      <AdminPageHeader
        title="My Tasks"
        subtitle="Worked out from the bookings and the upkeep schedule. Finishing one clears it for everyone."
        mob={mob}
      />

      <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        {ORDER.map((k) => {
          const n = byKind(k).length;
          return <StatCard key={k} label={KIND[k].stat} value={n} color={n ? KIND[k].color : undefined} />;
        })}
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: C.textS, fontSize: 13.5, margin: 0, padding: "28px 16px", border: `1px dashed ${cBr}`, borderRadius: 12, textAlign: "center" }}>
          <Icon name="check-circle" size={18} style={{ color: "#2e9e4e", verticalAlign: -4, marginRight: 8 }} />
          Nothing to do right now.
        </p>
      ) : ORDER.filter((k) => byKind(k).length > 0).map((k) => (
        <section key={k} aria-labelledby={`tasks-${k}`} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 id={`tasks-${k}`} style={{ color: C.textH, fontSize: 16, fontWeight: 600, margin: 0 }}>
              {KIND[k].section} <span style={{ color: C.textS, fontWeight: 400 }}>({byKind(k).length})</span>
            </h2>
            <span style={{ color: C.textS, fontSize: 12.5 }}>{KIND[k].hint}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mob ? "1fr" : "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
            {byKind(k).map(card)}
          </div>
        </section>
      ))}

      {comingUp.length > 0 && (
        <section aria-labelledby="coming-up" style={{ background: soft, borderRadius: 12, padding: "16px 20px", marginTop: 8 }}>
          <h2 id="coming-up" style={{ color: C.textH, fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>Coming up</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {comingUp.map((c) => (
              <li key={c.key} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13.5 }}>
                <span style={{ color: C.textS, fontSize: 12, width: 92, flexShrink: 0 }}>{fmtDate(c.date).replace(/,\s*\d{4}$/, "")}</span>
                <span style={{ color: C.textB }}>{c.text} <span style={{ color: C.textS }}>· {c.sub}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!upkeep.enabled && (
        <p style={{ color: C.textS, fontSize: 12, marginTop: 20 }}>
          <Icon name="info" size={12} style={{ verticalAlign: -1, marginRight: 6 }} />
          The upkeep schedule, and supplies coming off the stock, start after the next database update.
        </p>
      )}

      {open?.kind === "prepare" && open.booking && (
        <PrepModal booking={open.booking} facilities={facilities} onClose={() => void done()} />
      )}
      {open?.kind === "inspect" && open.booking && (
        <CheckoutModal booking={open.booking} facilities={facilities} mob={mob} inspectOnly onClose={() => void done()} />
      )}
      {open?.kind === "clean" && (
        <FinishWithSupplies
          title={`Clean ${open.facilities[0]?.name ?? ""}`}
          subtitle={open.detail}
          defaults={upkeep.cleaningSupplies[open.facilities[0]?.id] ?? []}
          inventory={inventory}
          doneLabel="Mark cleaned"
          onClose={() => setOpen(null)}
          onSave={async (supplies, note) => {
            const res = await fetch("/api/facilities/cleaned", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: [open.facilities[0].id], supplies, note }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) return json?.error ?? "Could not save it.";
            if (json.cleaned === 0) return "Someone already marked it clean.";
            await done();
            return null;
          }}
        />
      )}
      {open?.kind === "upkeep" && open.upkeep && (
        <FinishWithSupplies
          title={open.title}
          subtitle={open.upkeep.notes || open.detail}
          defaults={open.upkeep.supplies}
          inventory={inventory}
          doneLabel="Done"
          onClose={() => setOpen(null)}
          onSave={async (supplies, note) => {
            const res = await fetch("/api/upkeep/run", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: open.upkeep!.id, dueDate: open.date, supplies, note }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) return json?.error ?? "Could not save it.";
            await done();
            return null;
          }}
        />
      )}
    </div>
  );
}

/** Finishing a cleaning or an upkeep task: confirm what was used. */
function FinishWithSupplies({ title, subtitle, defaults, inventory, doneLabel, onClose, onSave }: {
  title: string;
  subtitle: string;
  defaults: SupplyLine[];
  inventory: InventoryItem[];
  doneLabel: string;
  onClose: () => void;
  /** Resolves with an error to show, or null when saved. */
  onSave: (supplies: SupplyLine[], note: string) => Promise<string | null>;
}) {
  const { C, inp } = useAdminStyle();
  const { toast } = useToast();
  const [lines, setLines] = useState<SupplyLine[]>(defaults);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} width={560}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <ActionButton onClick={onClose}>Not yet</ActionButton>
          <ActionButton kind="primary" icon="check" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            const err = await onSave(nonZero(lines), note.trim());
            setBusy(false);
            if (err) setError(err);
            else toast(`${title}: done.`, "success");
          }}>{busy ? "Saving…" : doneLabel}</ActionButton>
        </div>
      }>
      <Label>WHAT YOU USED</Label>
      <p style={{ color: C.textS, fontSize: 12.5, margin: "0 0 10px" }}>
        These are the usual amounts. Change any that were different today; the stock count follows what you enter.
      </p>
      <SupplyLines value={lines} onChange={setLines} inventory={inventory} emptyText="Nothing set. Add what you used, if anything." />
      <div style={{ marginTop: 16 }}>
        <Label htmlFor="task-note">Note (optional)</Label>
        <Textarea id="task-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
          placeholder="e.g. Filter needs replacing soon" style={{ ...inp, width: "100%", resize: "none" }} />
      </div>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
