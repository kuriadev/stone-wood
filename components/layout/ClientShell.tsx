"use client";

import { subscribeSettingsVersion, getSettingsVersion } from "@/lib/settingsLive";
import { useToast } from "@/contexts/ToastContext";
import { useRef, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { TopLoader, LoaderRef } from "@/components/layout/TopLoader";
import { GuestTabBar } from "@/components/layout/GuestTabBar";
import { useApp } from "@/contexts/AppContext";
import { MaintenanceGate } from "@/components/layout/MaintenanceGate";

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

  /* No curtain between pages: a nav click switches straight to the page
     (with its own fade and the top bar). The full-screen intro shows only
     when the site is first opened (IntroSplash.tsx). */

  // expose globally (for nav control)
  useEffect(() => {
    globalThis.loader = {
      get current() {
        return {
          /** Starts the top bar, then `push` (when given) navigates.
              `target` is accepted for the callers; it no longer changes anything. */
          start(target?: string, push?: () => void) {
            const from = pathRef.current;
            loaderRef.current?.start();
            if (sameRoute.current !== null) clearTimeout(sameRoute.current);
            sameRoute.current = window.setTimeout(() => {
              sameRoute.current = null;
              if (pathRef.current === from) loaderRef.current?.finish();
            }, 700);
            push?.();
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
    };
  }, []);

  // Finish the bar when the new route has actually rendered.
  //
  // Each link handler calls loader.start() and pushes; this
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
      {/* Phones: the bottom tabs, in the first HTML of every guest page
          (hidden by CSS above 760px; never on the admin or sign-in). */}
      <GuestTabBar />
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
