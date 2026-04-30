"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function PageTransition() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);

    const timeout = setTimeout(() => {
      setActive(false);
    }, 350); 

    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",

        
        background: "#0b0a07",

        
        opacity: active ? 1 : 0,
        transition: "opacity 0.25s ease",

        
        backdropFilter: active ? "blur(4px)" : "blur(0px)",
      }}
    />
  );
}
