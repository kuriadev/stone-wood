// ── Which theme to open in
//
// The site follows the device: a phone or computer set to light mode opens
// the site light, one set to dark opens it dark. If the visitor taps the
// theme button, that choice is kept -- until their device's own setting
// changes, and then the site follows the device again (someone whose phone
// turns dark at night gets the dark site at night).
//
// The choice is stored with the device setting it was made under:
//   localStorage["sw-theme-choice"] = '{"mode":"light","device":"dark"}'
//
// THEME_BOOT_SCRIPT runs in <head> before anything is drawn (app/layout.tsx),
// so the very first paint is already the right theme; ThemeContext uses the
// same rule after that. Keep the two in step.

export const THEME_CHOICE_KEY = "sw-theme-choice";

export type ThemeMode = "light" | "dark";

/** The device's own setting right now. */
export function deviceTheme(): ThemeMode {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** The theme to show: the visitor's choice while their device setting is
 *  still the one they chose under, otherwise the device's. */
export function resolveTheme(): ThemeMode {
  const device = deviceTheme();
  try {
    const raw = window.localStorage.getItem(THEME_CHOICE_KEY);
    const c = raw ? (JSON.parse(raw) as { mode?: string; device?: string }) : null;
    if (c && (c.mode === "light" || c.mode === "dark") && c.device === device) return c.mode;
  } catch { /* no storage: follow the device */ }
  return device;
}

/** Remember a tap on the theme button, with the device setting it was made under. */
export function rememberTheme(mode: ThemeMode): void {
  try {
    const device = deviceTheme();
    // Choosing what the device already shows is no choice: just follow it.
    if (mode === device) window.localStorage.removeItem(THEME_CHOICE_KEY);
    else window.localStorage.setItem(THEME_CHOICE_KEY, JSON.stringify({ mode, device }));
  } catch { /* not remembered, still switched */ }
}

/** The same rule as resolveTheme, as a tiny script for <head>.
 *
 *  The server renders the dark palette (inline styles from T(isDark)), and
 *  React only learns the device is light after it mounts, so a light visitor
 *  used to see the whole page dark for a moment on every refresh. For a light
 *  visitor the script adds `sw-boot`, which keeps the page hidden on the
 *  light background (globals.css) until ThemeContext has drawn it light; a
 *  timer takes it off anyway in case the app never starts. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark",m=d;try{var c=JSON.parse(localStorage.getItem("${THEME_CHOICE_KEY}")||"null");if(c&&(c.mode==="light"||c.mode==="dark")&&c.device===d)m=c.mode}catch(e){}var r=document.documentElement;r.classList.toggle("sw-dark",m==="dark");r.classList.toggle("sw-light",m==="light");r.style.colorScheme=m;if(m==="light"){r.classList.add("sw-boot");setTimeout(function(){r.classList.remove("sw-boot")},4000)}}catch(e){}})();`;
