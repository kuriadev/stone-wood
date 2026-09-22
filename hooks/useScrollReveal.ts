"use client";

import { useEffect } from "react";

/**
 * Scroll reveals for a page.
 *
 * MUST be called from the page's own component, not from the root layout.
 *
 * React hydrates Suspense boundaries independently, and a component's effect
 * only runs after *that component's* tree has hydrated. A previous version of
 * this lived in ClientShell (the layout), whose effect fires before a page
 * inside its own boundary has hydrated — so it marked DOM nodes React had not
 * adopted yet, and hydration reported a mismatch on every one of them.
 *
 * Attribute vs class made no difference: React 19 diffs any prop that differs
 * between its render and the DOM, including attributes it never rendered.
 * The only safe fix is to mutate *after* the subtree is hydrated, which
 * calling this from the page guarantees.
 *
 * Elements opt in with `className="sw-reveal"`; the styles live in globals.css.
 */
export function useScrollReveal() {
  useEffect(() => {
    const REVEALED = "data-sw-in";

    const revealAll = () => {
      document
        .querySelectorAll<HTMLElement>(".sw-reveal")
        .forEach((el) => el.setAttribute(REVEALED, ""));
    };

    // Reduced motion, or a browser without IntersectionObserver: show
    // everything at once rather than animating it in.
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      revealAll();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute(REVEALED, "");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -50px 0px" }
    );

    const observeNew = () => {
      document
        .querySelectorAll<HTMLElement>(`.sw-reveal:not([${REVEALED}])`)
        .forEach((el) => io.observe(el));
    };

    observeNew();

    // Catch anything mounted later — a filtered grid, an opened modal.
    const mo = new MutationObserver(observeNew);
    mo.observe(document.body, { childList: true, subtree: true });

    // Last resort. A .sw-reveal element starts at opacity 0, so anything the
    // observer cannot reach would stay invisible — reveal it rather than
    // leave content hidden.
    const sweep = window.setTimeout(revealAll, 3000);

    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(sweep);
    };
  }, []);
}
