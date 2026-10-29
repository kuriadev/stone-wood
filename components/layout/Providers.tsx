"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppProvider } from "@/contexts/AppContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion="never": animations always play, even on a device
    // set to reduce motion. The owner asked for this; it was "user".
    // LazyMotion + `domAnimation` ships the animation, exit, inView, tap,
    // focus and hover features and leaves out `drag`, `pan` and `layout`,
    // which this app does not use — Coverflow swipes with pointer events for
    // exactly that reason. `strict` makes a stray `motion.*` throw instead of
    // silently pulling the full bundle back in; use `m.*` inside this tree.
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="never">
    <ThemeProvider>
      <ToastProvider>
        <AppProvider>
          {children}
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>
    </MotionConfig>
    </LazyMotion>
  );
}
