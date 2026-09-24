"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface ThemeContextValue {
  isDark: boolean;
  toggle: () => void;
}

export const ThemeCtx = createContext<ThemeContextValue>({
  isDark: true,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const toggle = () => setIsDark((d) => !d);

  // Mirror the theme onto <html> as sw-dark / sw-light.
  //
  // A whole family of hover styles in globals.css is written as
  // `.sw-dark .sw-card:hover { … }`. Neither class was ever applied to
  // anything, so none of those rules could match and every card, button and
  // sidebar item on the site had a dead hover state.
  //
  // It goes on documentElement rather than a wrapper div because Home and
  // BookNow render their modals through createPortal into document.body —
  // a wrapper would leave those outside the selector, so the modals would
  // be the only surfaces still missing their hover treatment.
  //
  // Set from an effect, not from JSX: <html> is emitted by a server
  // component, and reconciling a className onto it would be a hydration
  // mismatch on the very first paint.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("sw-dark", isDark);
    root.classList.toggle("sw-light", !isDark);
  }, [isDark]);

  return (
    <ThemeCtx.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
