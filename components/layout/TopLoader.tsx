"use client";

import { useState, useImperativeHandle, forwardRef } from "react";

export interface LoaderRef {
  start: () => void;
  finish: () => void;
}

export const TopLoader = forwardRef<LoaderRef>((_, ref) => {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);

  useImperativeHandle(ref, () => ({
    start() {
      setActive(true);
      setProgress(15);
    },
    finish() {
      setProgress(100);

      setTimeout(() => {
        setActive(false);
        setProgress(0);
      }, 300);
    },
  }));

  if (!active) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 3,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background:
            "linear-gradient(90deg,#c9a84c,#f5d06f,#c9a84c)",
          boxShadow:
            "0 0 10px rgba(201,168,76,0.8),0 0 20px rgba(201,168,76,0.4)",
          transition: "width 0.25s ease",
        }}
      />
    </div>
  );
});