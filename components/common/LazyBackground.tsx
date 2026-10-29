"use client";

// ── A cover photo that downloads when it is about to be seen
//
// An <img> can say loading="lazy". A CSS background cannot, so every
// decorative backdrop on a long page is fetched the moment the page loads,
// however far down it sits. Measured on the home page: 439 KB of background
// photos for the package card and the closing banner, before anyone had
// scrolled to either.
//
// content-visibility: auto (the .sw-defer sections) does NOT fix this. It
// skips layout and paint for offscreen sections, which helps scrolling, but
// Chrome still requests their background images at load — checked with
// both elements inside a .sw-defer section with content-visibility computed
// as `auto`. So the image itself has to be withheld until it is needed.
//
// It starts loading 600px before the element reaches the screen, so by the
// time the reader scrolls to it the photo is already there; nothing pops
// in. Where IntersectionObserver is missing it simply loads at once.

import { useEffect, useRef, useState, type CSSProperties } from "react";

export function LazyBackground({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setNear(true); io.disconnect(); }
      },
      // Ahead of the screen, not at its edge: the download has to finish
      // before the photo is looked at, not start then.
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ ...style, backgroundImage: near ? `url(${src})` : undefined }}
    />
  );
}
