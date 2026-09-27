"use client";

import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { TopLoader, LoaderRef } from "@/components/layout/TopLoader";
import { CursorDot } from "@/components/layout/CursorDot";
import { useApp } from "@/contexts/AppContext";
import { MaintenanceGate } from "@/components/layout/MaintenanceGate";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const loaderRef = useRef<LoaderRef>(null);
  const pathname = usePathname();
  const { loading } = useApp();

  /* The pathname as of the last render, readable from inside the callbacks
     below without making them stale. */
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

  // expose globally (for nav control)
  useEffect(() => {
    (globalThis as any).loader = {
      get current() {
        return {
          start() {
            const from = pathRef.current;
            loaderRef.current?.start();
            if (sameRoute.current !== null) clearTimeout(sameRoute.current);
            sameRoute.current = window.setTimeout(() => {
              sameRoute.current = null;
              if (pathRef.current === from) loaderRef.current?.finish();
            }, 700);
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
  // Each link handler calls loader.start() and pushes straight away; this
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
      <CursorDot />
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
          key={pathname}
          className="sw-page"
          onAnimationEnd={(e) => { e.currentTarget.style.animation = "none"; }}
        >
          {children}
        </div>
      </MaintenanceGate>
    </>
  );
}
