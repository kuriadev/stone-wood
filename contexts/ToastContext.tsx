"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

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
  const tI: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ",
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
            <span style={{ color: tC[t.type], fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {tI[t.type]}
            </span>
            <span style={{ color: "#e0e0e0", fontSize: 12, lineHeight: 1.5 }}>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
