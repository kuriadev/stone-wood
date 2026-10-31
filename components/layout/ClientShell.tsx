"use client";

import { subscribeSettingsVersion, getSettingsVersion } from "@/lib/settingsLive";
import { useToast } from "@/contexts/ToastContext";
import { useRef, useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { TopLoader, LoaderRef } from "@/components/layout/TopLoader";
import { CursorDot } from "@/components/layout/CursorDot";
import { useApp } from "@/contexts/AppContext";
import { MaintenanceGate } from "@/components/layout/MaintenanceGate";
import { PageCurtain, CURTAIN_PAGES, type CurtainPhase } from "@/components/layout/PageCurtain";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const loaderRef = useRef<LoaderRef>(null);
  const pathname = usePathname();
  const { loading } = useApp();

  /* The pathname as of the last render, readable from inside the callbacks
     below without making them stale. */
  /* Rates & Settings changed while this page is open (lib/settingsLive.ts).
     A page that only shows things redraws with the new prices and hours;
     one with a form in progress keeps what the guest typed and says so. */
  const settingsVersion = useSyncExternalStore(subscribeSettingsVersion, getSettingsVersion, () => 0);
  const SHOW_ONLY = ["/", "/rooms", "/packages", "/gallery", "/about"];
  const redraws = SHOW_ONLY.includes(pathname);
  const { toast } = useToast();
  const seenVersion = useRef(0);
  useEffect(() => {
    if (settingsVersion === seenVersion.current) return;
    seenVersion.current = settingsVersion;
    if (!redraws && !pathname.startsWith("/admin")) toast("The resort's rates or hours were just updated. Your total is checked again when you confirm.", "info");
  }, [settingsVersion, redraws, pathname, toast]);

  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  /* Clicking the nav item for the page you are already on calls start() but
     never navigates: `pathname` does not change, `loading.content` does not
     change, so the effect below never runs and the bar trickles to 90% and
     parks there for the rest of the session.

     The bar cannot know the target -- callers only hand it start() -- so it
     checks afterwards instead: if the route is still what it was shortly
     after the click, nothing navigated and the bar completes itself. */
  const sameRoute = useRef<number | null>(null);

  /* The curtain between pages (PageCurtain.tsx). A nav click that names
     its destination fades it in, and the push waits until it covers the
     screen, so the old page never cuts to the new one. It fades out once
     the new page has really rendered (its data in, the route skeleton
     gone), and never before the page name has had time to be read.

     Once per page per visit: the first trip to Rooms shows "Rooms", later
     ones just switch (with the page's own fade). Remembered in
     sessionStorage, like the first-load intro. */
  const [curtain, setCurtain] = useState<{ phase: CurtainPhase; path: string | null }>({ phase: "idle", path: null });
  const curtainAt = useRef(0);
  const curtainTimers = useRef<number[]>([]);
  const clearCurtainTimers = useCallback(() => { curtainTimers.current.forEach(clearTimeout); curtainTimers.current = []; }, []);
  const seenCurtain = (path: string): boolean => {
    try { return (JSON.parse(sessionStorage.getItem("sw_curtains") ?? "[]") as string[]).includes(path); } catch { return false; }
  };
  const markCurtain = (path: string) => {
    try {
      const seen = JSON.parse(sessionStorage.getItem("sw_curtains") ?? "[]") as string[];
      if (!seen.includes(path)) sessionStorage.setItem("sw_curtains", JSON.stringify([...seen, path]));
    } catch { /* private mode: it may show again, nothing breaks */ }
  };
  // The curtain's state as of now, for start() (which never re-renders).
  const curtainRef = useRef(curtain);
  useEffect(() => { curtainRef.current = curtain; }, [curtain]);
  const liftCurtain = useCallback(() => {
    clearCurtainTimers();
    setCurtain((c) => (c.phase === "in" ? { ...c, phase: "out" } : c));
    curtainTimers.current.push(window.setTimeout(() => setCurtain({ phase: "idle", path: null }), 760));
  }, [clearCurtainTimers]);

  // expose globally (for nav control)
  useEffect(() => {
    (globalThis as any).loader = {
      get current() {
        return {
          /** `target` and `push`, when given, let the curtain run: it rises,
              then `push` navigates. Without them it is just the bar. */
          start(target?: string, push?: () => void) {
            const from = pathRef.current;
            // A second click while it is already on its way there: nothing
            // new to show, and the push is already queued.
            if (target && curtainRef.current.phase === "in" && curtainRef.current.path === target) return;
            const curtained = !!(target && push && CURTAIN_PAGES[target] && target !== from && !seenCurtain(target));
            loaderRef.current?.start();
            if (sameRoute.current !== null) clearTimeout(sameRoute.current);
            sameRoute.current = window.setTimeout(() => {
              sameRoute.current = null;
              if (pathRef.current === from) loaderRef.current?.finish();
            }, curtained ? 1400 : 700);
            if (!curtained) { push?.(); return; }
            clearCurtainTimers();
            markCurtain(target!);
            curtainAt.current = Date.now();
            setCurtain({ phase: "in", path: target! });
            curtainTimers.current.push(
              window.setTimeout(push!, 430),
              // Whatever goes wrong, the curtain never stays down.
              window.setTimeout(liftCurtain, 6000),
            );
          },
          finish() {
            if (sameRoute.current !== null) { clearTimeout(sameRoute.current); sameRoute.current = null; }
            loaderRef.current?.finish();
          },
        };
      },
    };
    return () => {
      if (sameRoute.current !== null) clearTimeout(sameRoute.current);
      clearCurtainTimers();
    };
  }, [clearCurtainTimers, liftCurtain]);

  // Lift the curtain once its page is in, has its data, and the route
  // skeleton (app/loading.tsx) has given way to the real page -- checked
  // every few frames, since nothing announces that. Then one more frame so
  // the page has painted before the fade starts.
  useEffect(() => {
    if (curtain.phase !== "in" || pathname !== curtain.path || loading.content) return;
    let t = 0;
    const check = () => {
      if (document.querySelector("[data-sw-route-loading]")) { t = window.setTimeout(check, 80); return; }
      t = window.setTimeout(() => requestAnimationFrame(liftCurtain), 0);
    };
    t = window.setTimeout(check, Math.max(0, 1100 - (Date.now() - curtainAt.current)));
    return () => clearTimeout(t);
  }, [curtain, pathname, loading.content, liftCurtain]);

  // Finish the bar when the new route has actually rendered.
  //
  // Each link handler calls loader.start() and pushes (after the curtain
  // rises, when there is one); this
  // effect fires once React has committed the new page, which is the real
  // end of the navigation. Previously every handler called finish() itself
  // *before* router.push, so the bar completed while the next page had not
  // even begun rendering.
  //
  // Skipped on first mount: nothing navigated, so no bar is in flight.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Wait for the data too, not just the route. These pages are client
    // components with nothing to await on the server, so the route commits
    // almost instantly while the collections they render are still being
    // fetched. Finishing on the route alone would put the bar back at the
    // old behaviour: complete before the page has anything real to show.
    if (loading.content) return;
    if (sameRoute.current !== null) { clearTimeout(sameRoute.current); sameRoute.current = null; }
    loaderRef.current?.finish();
  }, [pathname, loading.content]);

  return (
    <>
      <TopLoader ref={loaderRef} />
      <PageCurtain phase={curtain.phase} path={curtain.path} />
      {/* Home only. The trailing dot is a flourish for the page a visitor
          lands on; behind it are booking forms, calendars and the admin
          dashboard, where a circle drifting over dense tables and number
          fields is a distraction rather than a welcome. Gated here rather
          than inside CursorDot so the component stays a dumb effect and
          nothing it listens to is even registered on other routes. */}
      {pathname === "/" && <CursorDot />}
      {/*
        Keyed on the pathname so React swaps the subtree on every route
        change, which restarts the .sw-page entrance animation. Without the
        key the node would persist and the fade would only ever run once.

        onAnimationEnd strips the animation once it finishes. This matters
        even though the keyframe's final transform is "none": as long as the
        animation is still attached (animation-fill-mode: both keeps it
        attached forever), the browser treats the element as actively
        animating a transform, and resolves its *computed* transform to an
        identity matrix rather than the literal keyword "none" — which still
        counts as a non-"none" transform for CSS purposes. That silently
        makes this element (which wraps the entire, very tall page) the
        containing block for every position:fixed descendant, including
        every modal on the site — the modal ends up centered in the page's
        full scroll height instead of the viewport, only visible by zooming
        out. Clearing the animation after it ends removes that matrix
        entirely, letting position:fixed children anchor to the viewport
        again as normal.
      */}
      {/* Wraps the page, not the whole shell, so the top loader and the
          cursor dot keep working while the site is closed. */}
      <MaintenanceGate>
        <div
          key={redraws ? `${pathname}:${settingsVersion}` : pathname}
          className="sw-page"
          onAnimationEnd={(e) => { e.currentTarget.style.animation = "none"; }}
        >
          {children}
        </div>
      </MaintenanceGate>
    </>
  );
}
