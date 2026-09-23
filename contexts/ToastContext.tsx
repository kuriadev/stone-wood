"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/Icon";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (msg: string, type?: ToastType) => void;
}

export const ToastCtx = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const tC: Record<ToastType, string> = {
    success: "#4caf50",
    error: "#e55",
    warning: "#f5c518",
    info: "#4a9fd4",
  };
  // Icon names, not glyphs: a bare U+26A0 renders as a plain outline on some
  // platforms and a full-colour emoji on others, so the same toast looked
  // different machine to machine.
  const tI: Record<ToastType, IconName> = {
    success: "check-circle",
    error: "x",
    warning: "alert",
    info: "alert",
  };

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 80,
          right: 20,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "linear-gradient(135deg,#141210,#1a1714)",
              border: `1px solid ${tC[t.type]}33`,
              borderLeft: `3px solid ${tC[t.type]}`,
              borderRadius: 8,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 270,
              maxWidth: 360,
              boxShadow: `0 8px 32px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.03)`,
              animation: "swIn .3s cubic-bezier(.22,1,.36,1)",
              pointerEvents: "auto",
            }}
          >
            <Icon name={tI[t.type]} size={15} style={{ color: tC[t.type], flexShrink: 0 }} />
            <span style={{ color: "#e0e0e0", fontSize: 12, lineHeight: 1.5 }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
