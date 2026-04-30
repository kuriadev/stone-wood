"use client";

import { useRef, useEffect } from "react";
import { TopLoader, LoaderRef } from "@/components/layout/TopLoader";


export function ClientShell({ children }: { children: React.ReactNode }) {
  const loaderRef = useRef<LoaderRef>(null);

  // expose globally (for nav control)
  useEffect(() => {
    (globalThis as any).loader = loaderRef;
  }, []);

  return (
    <>
      <TopLoader ref={loaderRef} />
      {children}
    </>
  );
}