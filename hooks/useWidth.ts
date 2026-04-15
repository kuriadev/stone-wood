"use client";

import { useState, useEffect } from "react";

export function useWidth(): number {
  const [w, setW] = useState(600);
  useEffect(() => {
    const up = () => setW(window.innerWidth);
    up();
    window.addEventListener("resize", up);
    return () => window.removeEventListener("resize", up);
  }, []);
  return w;
}
