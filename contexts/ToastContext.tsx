"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { toastIconFor } from "@/components/ui/toastIcons";

export type ToastType = "success" | "error" | "warning" | "info";

/** Optional extras. `title` makes the message the second line; `action`
 *  adds one button (Undo, View, Retry…); `duration` overrides the default
 *  for the type. */
export interface ToastOptions {
  title?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastContextValue {
  toast: (msg: string, type?: ToastType, opts?: ToastOptions) => void;
}

export const ToastCtx = createContext<ToastContextValue>({ toast: () => {} });

/**
 * The toast design system. Every toast in the app goes through `toast(msg,
 * type, opts?)`; the look lives in app/globals.css (.sw-toast), drawn from
 * the --sw-* theme tokens so it follows Light and Dark.
 *
 *   success  green   something was saved or done
 *   error    red     it failed; stays longer so it can be read
 *   warning  amber   it worked, but needs attention
 *   info     gold    for the record (signed out, a note)
 *
 * Each type has its own icon, so the colour is never the only signal.
 * Sonner draws them: a live region a screen reader announces, stacking,
 * hover to pause, swipe or × to dismiss, and no focus stealing.
 */
const DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 4500,
  warning: 6000,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useCallback((msg: string, type: ToastType = "success", opts: ToastOptions = {}) => {
    const fn =
      type === "success" ? sonnerToast.success
      : type === "error" ? sonnerToast.error
      : type === "warning" ? sonnerToast.warning
      : sonnerToast.info;
    const title = opts.title ?? msg;
    const duration = opts.duration ?? DURATION[type];
    fn(title, {
      description: opts.title ? msg : undefined,
      duration,
      // An icon that fits the message ("Signed out." → a door-arrow).
      icon: toastIconFor(`${opts.title ?? ""} ${msg}`, type),
      // The countdown bar (.sw-toast::after) runs for as long as the toast.
      style: { ["--sw-toast-life" as string]: `${duration}ms` },
      action: opts.action ? { label: opts.action.label, onClick: opts.action.onClick } : undefined,
    });
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <Toaster />
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
