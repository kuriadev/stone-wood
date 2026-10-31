"use client";

// ── The notification bell, for every staff account
//
// A bell with an unread count at its top-left. When something new arrives
// (a booking, a payment, a guest message, a group arriving) it swings and
// plays a short chime; tapping it opens one centred panel with everything
// this person should know: what to do first, then what happened, each with
// its time and date. A row opens the screen where it is handled.
//
// What is in it comes from lib/notifications.ts, filtered to what this
// person's role may see, so the same bell works for the owner, front desk
// and the caretaker. "Seen" is remembered per person on this device.
//
// The panel can be dragged down by its handle to dismiss it (or let go to
// spring back), on a phone or with a mouse.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/contexts/AppContext";
import { useOps } from "@/contexts/OpsContext";
import { useStaff } from "@/contexts/StaffContext";
import { canOpenTab } from "@/lib/permissions";
import { buildNotes, sortNotes, noteWhen, noteStamp, type Note, type NoteTone } from "@/lib/notifications";
import { manilaDate } from "@/lib/finance";
import { useAdminStyle, useConfirm } from "@/components/admin/ui";
import { Icon } from "@/components/common/Icon";
import { gold } from "@/lib/styles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AdminTab } from "@/types/admin";
import { SIGNAL } from "@/components/admin/signals";
import "./NotificationBell.css";

const TONE: Record<NoteTone, string> = { info: SIGNAL.progress, good: SIGNAL.done, warn: SIGNAL.attention, urgent: SIGNAL.urgent };
const SEEN_CAP = 600;
/** Notes older than this are counted as seen the first time the bell is
 *  used on a device, so a new account doesn't start at "38 unread". */
const FIRST_RUN_GRACE_MS = 12 * 3_600_000;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: still works this visit */ }
};

/** A short two-note chime, made in the browser so there is no sound file to
 *  load. Browsers allow it once the person has interacted with the page,
 *  which on the admin is from the sign-in onwards. */
let audio: AudioContext | null = null;
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
    const t0 = audio.currentTime + 0.02;
    [[880, 0], [1318.5, 0.13]].forEach(([freq, delay]) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + delay);
      gain.gain.linearRampToValueAtTime(0.14, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.55);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.6);
    });
  } catch { /* no sound is never an error */ }
}

/** Where a tapped note goes: the screen, and the booking it is about. */
export interface NoteTarget { tab: AdminTab; bookingId?: string; opsView?: Note["opsView"] }

export function NotificationBell({ onOpen, size = 40 }: { onOpen: (target: NoteTarget) => void; size?: number }) {
  const { bookings, customerMessages, inventory } = useApp();
  const ops = useOps();
  const staff = useStaff();
  const role = staff.me?.role ?? "Owner";
  const who = staff.me?.id ?? staff.me?.username ?? "owner";

  // Relative times ("12 min ago") and "arriving today" move with the clock.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const notes = useMemo(() => {
    const all = buildNotes({
      bookings, payments: ops.payments, dateChanges: ops.dateChanges, inspections: ops.inspections,
      messages: customerMessages, requests: ops.requests ?? [], inventory, now,
    });
    return sortNotes(all.filter((n) => staff.can(n.perm) && n.tabs.some((t) => canOpenTab(role, t))));
  }, [bookings, ops.payments, ops.dateChanges, ops.inspections, ops.requests, customerMessages, inventory, now, staff, role]);

  return <NotificationBellView notes={notes} now={now} who={who} canOpen={(t) => canOpenTab(role, t)} onOpen={onOpen} size={size} />;
}

/** The bell and its panel for a given list of notes: what is unread, the
 *  ring and chime, and the panel. Kept apart from the data so it can be
 *  shown and tested with any list. */
export function NotificationBellView({ notes: allNotes, now, who, canOpen, onOpen, size = 40 }: {
  notes: Note[];
  now: Date;
  /** Whose "seen" list this is (one per staff member, per device). */
  who: string;
  canOpen: (tab: AdminTab) => boolean;
  onOpen: (target: NoteTarget) => void;
  size?: number;
}) {
  const { C, cBr, isDark } = useAdminStyle();
  const seenKey = `sw_notes_seen_${who}`;
  const clearedKey = `sw_notes_cleared_${who}`;
  const muteKey = "sw_notes_muted";
  const [confirm, confirmDialog] = useConfirm();

  // ── Cleared, per person, on this device ──
  // Notes are built from the live records, not stored, so "clear" hides
  // the ones on the list now; anything new after that still comes in. A
  // to-do that is still not done stays cleared until it changes into a new
  // note (tomorrow's stock reminder, say).
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage after mount
    setCleared(new Set(read<string[]>(clearedKey, [])));
  }, [clearedKey]);
  const notes = useMemo(() => allNotes.filter((n) => !cleared.has(n.id)), [allNotes, cleared]);
  const clearAll = () => {
    // Remembered only while the note still exists, so the list stays small.
    const live = new Set(allNotes.map((n) => n.id));
    const next = [...new Set([...cleared, ...allNotes.map((n) => n.id)])].filter((id) => live.has(id)).slice(-SEEN_CAP);
    setCleared(new Set(next));
    write(clearedKey, next);
  };

  // ── Seen, per person, on this device ──
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const stored = read<string[] | null>(seenKey, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage after mount
    setMuted(read<boolean>(muteKey, false));
    if (stored) { setSeen(new Set(stored)); return; }
    // First time on this device: anything older than the grace period is
    // treated as already known.
    const cutoff = Date.now() - FIRST_RUN_GRACE_MS;
    setSeen(new Set(allNotes.filter((n) => !n.action && Date.parse(n.at) < cutoff).map((n) => n.id)));
    // Only on first mount for this person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenKey]);

  const unread = useMemo(() => (seen ? notes.filter((n) => !seen.has(n.id)) : []), [notes, seen]);
  const saveSeen = useCallback((next: Set<string>) => {
    // Keep only what still exists, newest last, capped.
    const live = new Set(allNotes.map((n) => n.id));
    const kept = [...next].filter((id) => live.has(id)).slice(-SEEN_CAP);
    setSeen(new Set(kept));
    write(seenKey, kept);
  }, [allNotes, seenKey]);
  const markSeen = (ids: string[]) => { if (seen) saveSeen(new Set([...seen, ...ids])); };

  // ── Ring and chime when something new arrives ──
  const prevUnread = useRef<Set<string> | null>(null);
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (!seen) return;
    const ids = new Set(unread.map((n) => n.id));
    const before = prevUnread.current;
    prevUnread.current = ids;
    if (!before) return; // the first count is not news
    const fresh = [...ids].some((id) => !before.has(id));
    if (!fresh) return;
    setRinging(true);
    if (!muted) chime();
    const t = setTimeout(() => setRinging(false), 1200);
    return () => clearTimeout(t);
  }, [unread, seen, muted]);

  // ── The panel ──
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"all" | "todo">("all");
  const todo = notes.filter((n) => n.action);
  const shown = view === "todo" ? todo : notes;

  const groups = useMemo(() => {
    const today = manilaDate(now);
    const yesterday = manilaDate(new Date(now.getTime() - 86_400_000));
    const out: { label: string; items: Note[] }[] = [];
    const push = (label: string, n: Note) => {
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(n); else out.push({ label, items: [n] });
    };
    for (const n of shown) {
      if (n.action) { push("To do", n); continue; }
      const d = manilaDate(new Date(n.at));
      push(d === today ? "Today" : d === yesterday ? "Yesterday" : "Earlier", n);
    }
    return out;
  }, [shown, now]);

  const go = (n: Note) => {
    markSeen([n.id]);
    setOpen(false);
    const tab = n.tabs.find((t) => canOpen(t));
    // After the panel's close animation, so the screen it opens is seen
    // arriving rather than appearing behind a dialog on its way out.
    if (tab) setTimeout(() => onOpen({ tab, bookingId: n.bookingId, opsView: n.opsView }), 120);
  };

  // ── Drag down to dismiss ──
  const panelRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number; id: number } | null>(null);
  const setDy = (dy: number, animate: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform .32s cubic-bezier(.22,1,.36,1), opacity .32s ease" : "none";
    el.style.transform = dy ? `translateY(${dy}px)` : "";
    el.style.opacity = dy > 0 ? String(Math.max(0.35, 1 - dy / 500)) : "";
  };
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Down freely; up only a little, with resistance.
    const raw = e.clientY - d.y0;
    d.dy = raw > 0 ? raw : raw / 6;
    setDy(d.dy, false);
  };
  const onGrabUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const speed = d.dy / Math.max(1, performance.now() - d.t0); // px per ms
    if (d.dy > 140 || (d.dy > 40 && speed > 0.6)) {
      setDy(window.innerHeight, true);
      setTimeout(() => { setOpen(false); setDy(0, false); }, 220);
    } else {
      setDy(0, true);
    }
  };

  const count = unread.length;
  const badge = count > 99 ? "99+" : String(count);
  const surface = isDark ? "#151310" : "#ffffff";

  return (
    <>
      <button
        type="button"
        className={`sw-bell${ringing ? " sw-bell--ring" : ""}`}
        onClick={() => { setOpen(true); setView("all"); }}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        title="Notifications"
        style={{
          width: size, height: size, borderRadius: 12, border: `1px solid ${count ? gold + "66" : cBr}`,
          background: count ? `${gold}14` : "transparent", color: count ? C.goldInk : C.textS,
        }}
      >
        <span className="sw-bell__icon"><Icon name="bell" size={Math.round(size * 0.45)} /></span>
        {count > 0 && <span className="sw-bell__badge" aria-hidden="true">{badge}</span>}
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDy(0, false); }}>
        <DialogContent
          showCloseButton={false}
          className="border-0 bg-transparent p-0 shadow-none sm:max-w-[min(34rem,calc(100%-2rem))]"
          style={{ background: "transparent" }}
        >
          <div ref={panelRef} className="sw-notes" style={{ background: surface, border: `1px solid ${cBr}`, "--sw-notes-line": cBr } as CSSProperties}>
            {/* Grab handle + header: drag down to dismiss. */}
            <div
              className="sw-notes__grab"
              onPointerDown={onGrabDown}
              onPointerMove={onGrabMove}
              onPointerUp={onGrabUp}
              onPointerCancel={onGrabUp}
            >
              <span className="sw-notes__handle" aria-hidden="true" style={{ background: cBr }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 18px 14px" }}>
                <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 11, background: `${gold}1c`, color: C.goldInk, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="bell" size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DialogTitle style={{ color: C.textH, fontFamily: "'Satoshi',system-ui,sans-serif", fontSize: 19, fontWeight: 500, margin: 0 }}>Notifications</DialogTitle>
                  <DialogDescription style={{ color: C.textS, fontSize: 12.5, margin: "2px 0 0" }}>
                    {count ? `${count} unread` : "All caught up"} · {todo.length} to do · updates live
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { const m = !muted; setMuted(m); write(muteKey, m); if (!m) chime(); }}
                  aria-label={muted ? "Turn the notification sound on" : "Turn the notification sound off"}
                  title={muted ? "Sound off" : "Sound on"}
                  className="sw-notes__iconbtn"
                  style={{ color: muted ? C.textXS : C.goldInk, border: `1px solid ${cBr}` }}
                >
                  <Icon name={muted ? "bell-off" : "bell"} size={16} />
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="sw-notes__iconbtn"
                  style={{ color: C.textS, border: `1px solid ${cBr}` }}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>

            {/* All / To do */}
            <div role="tablist" aria-label="Which notifications" className="sw-notes__tabs" style={{ borderColor: cBr }}>
              {([["all", "All", notes.length], ["todo", "To do", todo.length]] as const).map(([k, label, n]) => (
                <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                  className="sw-notes__tab" style={{ color: view === k ? C.textH : C.textS }}>
                  {label} <span style={{ color: view === k ? C.goldInk : C.textXS, fontWeight: 700 }}>{n}</span>
                </button>
              ))}
              <span className="sw-notes__tabpill" style={{ transform: view === "todo" ? "translateX(100%)" : "none", background: `${gold}1f`, borderColor: `${gold}55` }} aria-hidden="true" />
            </div>

            <div className="sw-notes__list">
              {groups.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.textS }}>
                  <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(46,158,78,0.12)", color: "#2e9e4e", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                    <Icon name="check" size={22} />
                  </span>
                  <p style={{ color: C.textH, fontSize: 15, margin: "0 0 4px" }}>You&rsquo;re all caught up</p>
                  <p style={{ fontSize: 13, margin: 0 }}>{view === "todo" ? "Nothing waiting on you." : "New bookings, payments and arrivals will show here."}</p>
                </div>
              ) : groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h3 className="sw-notes__group" style={{ color: g.label === "To do" ? C.goldInk : C.textXS, background: surface }}>
                    {g.label} <span style={{ fontWeight: 500 }}>· {g.items.length}</span>
                  </h3>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {g.items.map((n, i) => {
                      const isNew = seen ? !seen.has(n.id) : false;
                      const tone = TONE[n.tone];
                      return (
                        <li key={n.id} className="sw-notes__item" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                          <button type="button" onClick={() => go(n)} className="sw-notes__row"
                            style={{ background: isNew ? (isDark ? "rgba(201,168,76,0.06)" : "rgba(201,168,76,0.08)") : "transparent" }}>
                            <span aria-hidden="true" className="sw-notes__dot" style={{ background: `${tone}1f`, color: tone }}>
                              <Icon name={n.icon} size={16} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: C.textH, fontSize: 14, fontWeight: isNew ? 700 : 500, lineHeight: 1.35 }}>{n.title}</span>
                                {isNew && <span aria-label="unread" style={{ width: 7, height: 7, borderRadius: "50%", background: gold, flexShrink: 0 }} />}
                              </span>
                              <span className="sw-notes__body" style={{ color: C.textS }}>{n.body}</span>
                              <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, fontSize: 11.5 }}>
                                <span style={{ color: n.tone === "urgent" ? tone : C.goldInk, fontWeight: 600 }}>{noteWhen(n.at, now)}</span>
                                <span style={{ color: C.textXS }}>{noteStamp(n.at)}</span>
                              </span>
                            </span>
                            <Icon name="chevron-right" size={15} style={{ color: C.textXS, flexShrink: 0, alignSelf: "center" }} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="sw-notes__foot" style={{ borderColor: cBr }}>
              <button className="sw-ulink" type="button" disabled={notes.length === 0}
                onClick={() => confirm({
                  title: "Clear all notifications?",
                  body: `All ${notes.length} come off your list${todo.length ? `, including ${todo.length} still to do` : ""}. Nothing about the bookings themselves changes, and new notifications still come in.`,
                  action: "Clear all",
                  onConfirm: clearAll,
                })}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: notes.length ? C.dangerInk : C.textXS, cursor: notes.length ? "pointer" : "default", fontSize: 13, fontWeight: 600, padding: "8px 4px" }}>
                <Icon name="trash" size={14} /> Clear all
              </button>
              <button className="sw-ulink" type="button" disabled={count === 0} onClick={() => markSeen(notes.map((n) => n.id))}
                style={{ background: "none", border: "none", color: count ? C.goldInk : C.textXS, cursor: count ? "pointer" : "default", fontSize: 13, fontWeight: 600, padding: "8px 4px" }}>
                Mark all as read
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
