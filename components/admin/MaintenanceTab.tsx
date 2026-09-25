"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useApp } from "@/contexts/AppContext";
import { T } from "@/lib/theme";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gold, goldBtn, outBtn } from "@/lib/styles";
import { Icon } from "@/components/common/Icon";
import {
  MAINTENANCE_REASONS,
  MAINTENANCE_REASON_LIST,
  type MaintenanceReason,
  type MaintenanceState,
} from "@/types/maintenance";

/**
 * The switch that closes the public site.
 *
 * Deliberately not a live toggle. The reason and message are edited as a
 * draft and only take effect on an explicit save, so an admin cannot black
 * out the resort with a stray click on a radio button.
 *
 * /login and /admin stay reachable while it is on — see MaintenanceGate —
 * so this can always be switched back off.
 */
export function MaintenanceTab({ mob }: { mob: boolean }) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const { toast } = useToast();
  const { maintenance, applyMaintenance } = useApp();

  const [reason, setReason] = useState<MaintenanceReason>(maintenance.reason);
  const [message, setMessage] = useState(maintenance.message);
  const [saving, setSaving] = useState(false);

  // Follow the server if it changes underneath us (another admin, another
  // tab). Skipped mid-save, or a poll landing at the wrong moment would
  // wipe what is being typed.
  useEffect(() => {
    if (saving) return;
    setReason(maintenance.reason);
    setMessage(maintenance.message);
  }, [maintenance.reason, maintenance.message, saving]);

  const save = async (active: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active, reason, message }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        maintenance?: MaintenanceState;
      };
      if (!res.ok || !json.success || !json.maintenance) {
        toast(json.error ?? "Could not update maintenance mode.", "error");
        return;
      }
      applyMaintenance(json.maintenance);
      toast(
        active ? "The public site is now closed to visitors." : "The public site is live again.",
        "success",
      );
    } catch {
      toast("Could not reach the server.", "error");
    } finally {
      setSaving(false);
    }
  };

  const live = maintenance.active;
  const dirty = reason !== maintenance.reason || message !== maintenance.message;

  const card: React.CSSProperties = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: mob ? 18 : 24,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
      {/* Current state */}
      <div
        style={{
          ...card,
          borderColor: live ? "#c0392b66" : C.border,
          background: live ? (isDark ? "rgba(192,57,43,0.07)" : "rgba(192,57,43,0.05)") : C.bgCard,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: live ? "#c0392b" : "#4caf50",
              boxShadow: `0 0 10px ${live ? "#c0392b" : "#4caf50"}`,
              flex: "none",
            }}
          />
          <span style={{ color: C.textH, fontSize: mob ? 17 : 19, fontWeight: 500 }}>
            {live ? "The public site is CLOSED" : "The public site is LIVE"}
          </span>
        </div>

        <p style={{ color: C.textS, fontSize: 14, lineHeight: 1.7, margin: "12px 0 0" }}>
          {live
            ? `Visitors see "${MAINTENANCE_REASONS[maintenance.reason].title}" over a blurred homepage and cannot browse or book. You can still reach this panel and the login page.`
            : "Everything is running normally. Choose a reason below and close the site when you need to."}
        </p>
      </div>

      {/* Reason */}
      <div style={card}>
        <p style={{ color: C.textXS, fontSize: 11.5, letterSpacing: 2.5, margin: "0 0 4px" }}>
          WHAT SHOULD VISITORS BE TOLD?
        </p>
        <p style={{ color: C.textS, fontSize: 13.5, margin: "0 0 18px" }}>
          This is the headline shown on the notice.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MAINTENANCE_REASON_LIST.map((r) => {
            const on = reason === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={on}
                style={{
                  textAlign: "left",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  padding: mob ? "13px 14px" : "15px 18px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: on
                    ? (isDark ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.1)")
                    : "transparent",
                  border: `1px solid ${on ? `${gold}66` : C.border}`,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    flex: "none",
                    marginTop: 3,
                    border: `1px solid ${on ? gold : C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: gold }} />}
                </span>
                <span>
                  <span style={{ display: "block", color: on ? gold : C.textH, fontSize: 15, marginBottom: 3 }}>
                    {MAINTENANCE_REASONS[r].label}
                  </span>
                  <span style={{ display: "block", color: C.textS, fontSize: 13, lineHeight: 1.6 }}>
                    {MAINTENANCE_REASONS[r].title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 20 }}>
          <Label
            htmlFor="maintenance-message"
            style={{ display: "block", color: C.textXS, fontSize: 11.5, letterSpacing: 2.5, marginBottom: 8 }}
          >
            EXTRA LINE (OPTIONAL)
          </Label>
          <Input
            id="maintenance-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 200))}
            placeholder="e.g. We reopen on Monday, 5 October."
            aria-describedby="maintenance-message-hint"
            style={{
              padding: "11px 14px",
              height: "auto",
              borderRadius: 8,
              background: C.bgCard2,
              color: C.textH,
              fontSize: 14.5,
            }}
          />
          <span id="maintenance-message-hint" style={{ display: "block", color: C.textXS, fontSize: 12, marginTop: 6 }}>
            {message.length}/200 · shown under the headline
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {live ? (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(false)}
              style={{
                ...goldBtn,
                padding: "13px 26px",
                borderRadius: 6,
                letterSpacing: 1.5,
                opacity: saving ? 0.5 : 1,
              }}
            >
              <Icon name="check" size={15} style={{ marginRight: 8, verticalAlign: "-2px" }} />
              REOPEN THE SITE
            </button>
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                style={{ ...outBtn, padding: "13px 22px", borderRadius: 6, opacity: saving ? 0.5 : 1 }}
              >
                UPDATE THE NOTICE
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            style={{
              background: "#c0392b",
              color: "#fff",
              border: "none",
              padding: "13px 26px",
              borderRadius: 6,
              letterSpacing: 1.5,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Icon name="alert" size={15} style={{ marginRight: 8, verticalAlign: "-2px" }} />
            CLOSE THE PUBLIC SITE
          </button>
        )}
      </div>

      <p style={{ color: C.textXS, fontSize: 12.5, lineHeight: 1.7, margin: 0 }}>
        Visitors already on the site see the change within a minute, without refreshing. The
        admin panel and login page are never blocked, so you can always switch this back off.
      </p>
    </div>
  );
}
