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
      */}
      <div key={pathname} className="sw-page">
        {children}
      </div>
    </>
  );
}
