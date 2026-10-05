"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
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
    // LazyMotion + `domAnimation` ships the animation, exit, inView, tap,
    // focus and hover features and leaves out `drag`, `pan` and `layout`,
    // which this app does not use — Coverflow swipes with pointer events for
    // exactly that reason. `strict` makes a stray `motion.*` throw instead of
    // silently pulling the full bundle back in; use `m.*` inside this tree.
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
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
