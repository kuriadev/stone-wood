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

  // expose globally (for nav control)
  useEffect(() => {
    (globalThis as any).loader = loaderRef;
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
