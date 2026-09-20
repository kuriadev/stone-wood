"use client";

import { useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { TopLoader, LoaderRef } from "@/components/layout/TopLoader";
import { CursorDot } from "@/components/layout/CursorDot";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const loaderRef = useRef<LoaderRef>(null);
  const pathname = usePathname();

  // expose globally (for nav control)
  useEffect(() => {
    (globalThis as any).loader = loaderRef;
  }, []);

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
      <div
        key={pathname}
        className="sw-page"
        onAnimationEnd={(e) => { e.currentTarget.style.animation = "none"; }}
      >
        {children}
      </div>
    </>
  );
}
