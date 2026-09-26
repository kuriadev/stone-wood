"use client";

// ── Shared pieces for the Sales / Bookings / Facilities / Reports screens
//
// Thin wrappers over the shadcn components in components/ui, so these
// screens follow the same rules as the rest of the admin (see README →
// "Tailwind and shadcn"):
//
//   Modal          → Dialog, landscape via min(<cap>, calc(100% - 2rem))
//   ConfirmDialog  → AlertDialog, for destructive or decisive actions. Its
//                    confirm is a plain Button, not AlertDialogAction,
//                    because the handlers are async and can fail — the panel
//                    must stay open so the error has somewhere to render.
//   Btn            → Button     Pill → Badge     TableShell → Table
//   ViewTabs       → Tabs (view switchers)
//   Segmented      option pickers inside forms (radiogroup of buttons)

import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { T } from "@/lib/theme";
import { gold } from "@/lib/styles";
import { Icon, type IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label as UiLabel } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/native-select";

export { TableRow as Row, TableCell as Cell };

export function useAdminStyle() {
  const { isDark } = useTheme();
  const C = T(isDark);
  return {
    isDark,
    C,
    /** C.inp for shadcn Input / Textarea / NativeSelect: they carry a fixed
     *  h-9, so the app's padded fields need height back to auto. */
    inp: { ...C.inp, height: "auto" } as CSSProperties,
    cBg: isDark ? "#0c0b09" : "#ffffff",
    cBr: isDark ? "#1e1a14" : "#e4ddd1",
    soft: isDark ? "#11100d" : "#f7f3ec",
    rowBg: (i: number) => (isDark ? (i % 2 === 0 ? "#0a0906" : "#080604") : (i % 2 === 0 ? "#ffffff" : "#faf7f2")),
    head: isDark ? "#070604" : "#f5f0e8",
  };
}

export const serif = "'Cormorant Garamond',Georgia,serif";

// ── Page heading ──────────────────────────────────────────────────────
export function PageHead({ title, subtitle, action, mob }: { title: string; subtitle?: string; action?: ReactNode; mob?: boolean }) {
  const { C } = useAdminStyle();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <h2 style={{ color: C.textH, fontFamily: serif, fontSize: mob ? 24 : 30, fontWeight: 400, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ color: C.textS, fontSize: 13.5, margin: "6px 0 0" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Modal (landscape Dialog) ──────────────────────────────────────────
// Header and footer stay put; only the body scrolls. The close X is
// shadcn's own, top-right.
export function Modal({
  title, subtitle, onClose, children, footer, width = 560,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { C } = useAdminStyle();
  const rem = Math.round((width / 16) * 10) / 10;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 p-0"
        style={{ maxWidth: `min(${rem}rem, calc(100% - 2rem))`, width: "100%" }}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12 text-left">
          <DialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 22, fontWeight: 400 }}>{title}</DialogTitle>
          {subtitle
            ? <DialogDescription style={{ color: C.textS, fontSize: 13 }}>{subtitle}</DialogDescription>
            : <DialogDescription className="sr-only">Details</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <DialogFooter className="shrink-0 border-t px-6 py-3 sm:justify-stretch [&>*]:w-full">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

// ── ConfirmDialog (AlertDialog) ───────────────────────────────────────
export function ConfirmDialog({
  title, description, children, onCancel, confirm, cancelLabel = "Cancel", width = 460,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  onCancel: () => void;
  /** The confirming Button(s). A plain Button, so an async failure keeps
   *  the dialog open. */
  confirm: ReactNode;
  cancelLabel?: string;
  width?: number;
}) {
  const { C } = useAdminStyle();
  const rem = Math.round((width / 16) * 10) / 10;
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent style={{ maxWidth: `min(${rem}rem, calc(100% - 2rem))` }}>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle style={{ color: C.textH, fontFamily: serif, fontSize: 21, fontWeight: 400 }}>{title}</AlertDialogTitle>
          {description
            ? <AlertDialogDescription style={{ color: C.textS, fontSize: 13.5 }}>{description}</AlertDialogDescription>
            : <AlertDialogDescription className="sr-only">Confirm this action</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          {confirm}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Form bits ─────────────────────────────────────────────────────────
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const { C } = useAdminStyle();
  if (!htmlFor) {
    // Heads a group of controls rather than one field: a <label> with no
    // control is an orphan (README → Accessibility notes).
    return <p style={{ color: C.textB, fontSize: 12.5, fontWeight: 600, margin: "0 0 6px" }}>{children}</p>;
  }
  return <UiLabel htmlFor={htmlFor} style={{ color: C.textB, fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>{children}</UiLabel>;
}

/** A choice between a few options inside a form (payment method, slot…). */
export function Segmented<V extends string>({
  value, options, onChange, size = "md", label,
}: {
  value: V;
  options: { value: V; label: ReactNode; hint?: ReactNode; disabled?: boolean }[];
  onChange: (v: V) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const { C, cBr } = useAdminStyle();
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={o.disabled} onClick={() => onChange(o.value)}
            style={{
              flex: 1, minWidth: 0, padding: size === "sm" ? "7px 10px" : "9px 12px", fontSize: 12.5, fontWeight: 600,
              borderRadius: 7, cursor: o.disabled ? "not-allowed" : "pointer", opacity: o.disabled ? 0.4 : 1,
              background: on ? `${gold}1c` : "transparent", color: on ? gold : C.textS,
              border: `1px solid ${on ? gold + "66" : cBr}`, textAlign: "center",
            }}>
            <div>{o.label}</div>
            {o.hint && <div style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.75, marginTop: 2 }}>{o.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

/** A view switcher: shadcn Tabs, one TabsContent per view. */
export function ViewTabs<V extends string>({
  value, onChange, views, maxWidth,
}: {
  value: V;
  onChange: (v: V) => void;
  views: { value: V; label: ReactNode; content: ReactNode }[];
  maxWidth?: number;
}) {
  const { C, cBr } = useAdminStyle();
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as V)}>
      <TabsList className="mb-4 h-auto flex-wrap gap-2 bg-transparent p-0" style={{ maxWidth }}>
        {views.map((v) => {
          const on = v.value === value;
          return (
            <TabsTrigger key={v.value} value={v.value}
              style={{ padding: "7px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 20, background: on ? `${gold}1c` : "transparent", color: on ? gold : C.textS, border: `1px solid ${on ? gold + "66" : cBr}`, boxShadow: "none", height: "auto", flex: "0 0 auto" }}>
              {v.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {views.map((v) => <TabsContent key={v.value} value={v.value}>{v.content}</TabsContent>)}
    </Tabs>
  );
}

export function Pill({ children, color, style }: { children: ReactNode; color: string; style?: CSSProperties }) {
  return (
    <Badge variant="outline" style={{ gap: 5, background: `${color}14`, color, border: `1px solid ${color}40`, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, whiteSpace: "nowrap", ...style }}>
      {children}
    </Badge>
  );
}

// Status colours follow README → "Chart and status colours mean something".
export const STATUS_COLOR: Record<string, string> = {
  Pending: "#f5c518",
  Confirmed: "#4caf50",
  Completed: "#4a9fd4",
  Cancelled: "#e55",
};

export const MONEY_COLOR: Record<string, string> = {
  "Paid in full": "#4caf50",
  "Partially paid": "#f5c518",
  Unpaid: "#e55",
  Forfeited: "#8a7a66",
};

// ── Buttons ───────────────────────────────────────────────────────────
type BtnKind = "primary" | "ghost" | "green" | "blue" | "red";
const TINT: Record<Exclude<BtnKind, "primary" | "ghost">, CSSProperties> = {
  green: { background: "rgba(76,175,80,0.1)", color: "#4caf50", border: "1px solid rgba(76,175,80,0.35)" },
  blue: { background: "rgba(74,159,212,0.1)", color: "#4a9fd4", border: "1px solid rgba(74,159,212,0.35)" },
  red: { background: "rgba(229,85,85,0.08)", color: "#e55", border: "1px solid rgba(229,85,85,0.3)" },
};

export function Btn({
  kind = "ghost", size = "md", icon, children, style, ...rest
}: {
  kind?: BtnKind;
  size?: "sm" | "md";
  icon?: IconName;
} & Omit<React.ComponentProps<typeof Button>, "size">) {
  const look: CSSProperties =
    kind === "primary" ? { background: "linear-gradient(135deg,#c9a84c,#e8c56a)", color: "#1a1000", border: "none", boxShadow: "0 2px 12px rgba(201,168,76,0.25)" }
      : kind === "ghost" ? {}
        : TINT[kind];
  return (
    <Button type="button" variant={kind === "ghost" ? "outline" : "default"} size={size === "sm" ? "sm" : "default"} {...rest}
      style={{ fontWeight: 600, ...look, ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 15} />}
      {children}
    </Button>
  );
}

// ── Money line ────────────────────────────────────────────────────────
export function Line({ label, value, strong, color }: { label: ReactNode; value: ReactNode; strong?: boolean; color?: string }) {
  const { C } = useAdminStyle();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: strong ? 15 : 13.5 }}>
      <span style={{ color: strong ? C.textH : C.textS, fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ color: color ?? (strong ? C.textH : C.textB), fontWeight: strong ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── Table shell ───────────────────────────────────────────────────────
// Table brings its own overflow wrapper, so this adds only the border.
export function TableShell({ head, children, minWidth = 720, empty, label }: { head: string[]; children: ReactNode; minWidth?: number; empty?: ReactNode; label?: string }) {
  const { C, cBg, cBr, head: hBg } = useAdminStyle();
  return (
    <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, overflow: "hidden" }}>
      <Table style={{ minWidth }} aria-label={label}>
        <TableHeader>
          <TableRow style={{ background: hBg, borderBottom: `1px solid ${cBr}` }}>
            {head.map((h, i) => (
              <TableHead key={h || `c${i}`} scope="col" style={{ padding: "11px 12px", color: C.textS, fontSize: 11.5, fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>
                {h || <span className="sr-only">Actions</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {children}
          {empty && (
            <TableRow><TableCell colSpan={head.length} style={{ padding: "28px 16px", textAlign: "center", color: C.textS, fontSize: 13.5 }}>{empty}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export const td: CSSProperties = { padding: "10px 12px", fontSize: 13, verticalAlign: "middle", whiteSpace: "normal" };

// ── Summary figure ────────────────────────────────────────────────────
export function Figure({ label, value, note, color }: { label: string; value: ReactNode; note?: ReactNode; color?: string }) {
  const { C, cBg, cBr } = useAdminStyle();
  return (
    <div style={{ background: cBg, border: `1px solid ${cBr}`, borderRadius: 10, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ color: C.textS, fontSize: 12.5, marginBottom: 8 }}>{label}</div>
      <div style={{ color: color ?? C.textH, fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      {note && <div style={{ color: C.textS, fontSize: 12, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" style={{ color: "#e55", fontSize: 13, margin: "10px 0 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
      <Icon name="alert" size={14} style={{ marginTop: 2, flexShrink: 0, color: "#e55" }} />{children}
    </p>
  );
}

/** NativeSelect that fills its column. The wrapper is w-fit by default, so
 *  a full-width select needs the wrapper widened (same trick InventoryTab
 *  uses). */
export function FullSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return (
    <div className="[&_[data-slot=native-select-wrapper]]:w-full">
      <NativeSelect {...props} />
    </div>
  );
}
