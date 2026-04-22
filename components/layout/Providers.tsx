"use client";

import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppProvider } from "@/contexts/AppContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          {children}
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
