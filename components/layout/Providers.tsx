"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppProvider } from "@/contexts/AppContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion="user" makes Motion honour the OS setting itself, at
    // animation time. Doing it in a component instead — branching on
    // useReducedMotion() to change what gets rendered — is a hydration bug:
    // the hook is false on the server (no matchMedia) and true on a client
    // that asked for reduced motion, so the two renders disagreed about
    // whether `initial` had been applied. Motion skips movement and keeps
    // the fade, which is what the media query is actually asking for.
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          {children}
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
