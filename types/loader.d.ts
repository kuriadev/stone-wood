// The page loader ClientShell puts on globalThis, so a page's own links can
// run the top bar and the curtain before navigating (components/layout/ClientShell.tsx).
export {};

declare global {
  // `var`, not `let`: only a var declaration adds a property to globalThis.
  var loader: { readonly current: { start(target?: string, push?: () => void): void; finish(): void } } | undefined;
}
