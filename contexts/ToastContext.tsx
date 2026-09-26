"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastContextValue {
  toast: (msg: string, type?: ToastType) => void;
}

export const ToastCtx = createContext<ToastContextValue>({ toast: () => {} });

/**
 * Toasts render through shadcn's Sonner now, not a hand-rolled stack.
 *
 * The context API is deliberately unchanged — `toast(msg, type)` — because
 * eight files call it and none of them should have to care what draws the
 * thing. Only the renderer moved.
 *
 * What Sonner brings that the old list did not: a live region, so a screen
 * reader announces the message; stacking, hover-to-pause and swipe-to-dismiss;
 * and focus management, so a toast never steals focus mid-form.
 *
 * The per-type accent is kept as an explicit colour rather than left to
 * Sonner's defaults, because the old toasts were the app's only feedback
 * surface and staff read them by colour: green accepted, red failed, amber
 * needs attention, blue informational.
 */
const ACCENT: Record<ToastType, string> = {
  success: "#4caf50",
  error: "#e55",
  warning: "#f5c518",
  info: "#4a9fd4",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useCallback((msg: string, type: ToastType = "success") => {
    // Sonner has no "warning" alias on older majors; call the matching method
    // where one exists and fall back to the base call otherwise.
    const fn =
      type === "success" ? sonnerToast.success
      : type === "error" ? sonnerToast.error
      : type === "warning" ? (sonnerToast.warning ?? sonnerToast)
      : sonnerToast.info;

    (fn as (m: string, o?: Record<string, unknown>) => void)(msg, {
      style: {
        background: "linear-gradient(135deg,#141210,#1a1714)",
        border: `1px solid ${ACCENT[type]}33`,
        borderLeft: `3px solid ${ACCENT[type]}`,
        color: "#e0e0e0",
        fontSize: 12,
      },
    });
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* bottom-80 clears the floating theme toggle, which is where the
          hand-rolled stack used to sit. */}
      <Toaster
        position="bottom-right"
        offset={80}
        duration={3500}
        toastOptions={{ style: { minWidth: 270, maxWidth: 360 } }}
      />
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
