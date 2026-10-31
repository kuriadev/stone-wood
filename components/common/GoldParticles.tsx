"use client";

/* Gold motes behind the staff sign-in (AdminLogin.tsx), on a plain 2D
 * canvas so it works on every browser and phone (no WebGL).
 *
 *   • motes drift slowly; close ones are joined by faint gold threads;
 *   • the cursor pushes them gently aside and threads itself to the
 *     nearest ones;
 *   • a click (or tap) sends a ripple that scatters them outward.
 *
 * It pauses while the tab is hidden and redraws at the screen's own size
 * and pixel density. Always animates, like the rest of the site. */

import { useEffect, useRef } from "react";

interface Mote { x: number; y: number; vx: number; vy: number; r: number; tw: number }

export function GoldParticles({ dark = true, className }: { dark?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const gold = dark ? [230, 199, 106] : [154, 123, 44];
    const rgba = (a: number) => `rgba(${gold[0]},${gold[1]},${gold[2]},${a})`;
    let w = 0, h = 0, ratio = 1;
    let motes: Mote[] = [];
    const mouse = { x: -9999, y: -9999, on: false };
    const ripples: { x: number; y: number; age: number }[] = [];
    let raf = 0;
    let last = 0;

    const seed = () => {
      // About one mote per 9,000 px², between 40 and 150.
      const n = Math.max(40, Math.min(150, Math.round((w * h) / 9000)));
      motes = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: 0.8 + Math.random() * 1.8, tw: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (motes.length === 0) seed();
    };

    const LINK = 120, PUSH = 140;

    const frame = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      const dt = last ? Math.min(3, (now - last) / 16.67) : 1;
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const r of ripples) r.age += dt;
      while (ripples.length && ripples[0].age > 90) ripples.shift();

      for (const m of motes) {
        // The cursor pushes gently.
        if (mouse.on) {
          const dx = m.x - mouse.x, dy = m.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH * PUSH && d2 > 0.01) {
            const d = Math.sqrt(d2), f = (1 - d / PUSH) * 0.35;
            m.vx += (dx / d) * f * dt; m.vy += (dy / d) * f * dt;
          }
        }
        // A click's ripple, a ring moving outward.
        for (const r of ripples) {
          const dx = m.x - r.x, dy = m.y - r.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const front = r.age * 7;
          if (Math.abs(d - front) < 40) {
            const f = (1 - Math.abs(d - front) / 40) * 1.4 * (1 - r.age / 90);
            m.vx += (dx / d) * f * dt; m.vy += (dy / d) * f * dt;
          }
        }
        // Drift, with friction back toward a slow float.
        m.vx *= 0.97; m.vy *= 0.97;
        if (Math.abs(m.vx) < 0.05) m.vx += (Math.random() - 0.5) * 0.02;
        if (Math.abs(m.vy) < 0.05) m.vy += (Math.random() - 0.5) * 0.02;
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.x < -20) m.x = w + 20; else if (m.x > w + 20) m.x = -20;
        if (m.y < -20) m.y = h + 20; else if (m.y > h + 20) m.y = -20;
        m.tw += 0.03 * dt;
      }

      // Threads between close motes.
      ctx.lineWidth = 0.6;
      for (let i = 0; i < motes.length; i++) {
        const a = motes[i];
        for (let j = i + 1; j < motes.length; j++) {
          const b = motes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            ctx.strokeStyle = rgba((1 - Math.sqrt(d2) / LINK) * (dark ? 0.28 : 0.32));
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        // And to the cursor, a little brighter.
        if (mouse.on) {
          const dx = a.x - mouse.x, dy = a.y - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK * 1.5) {
            ctx.strokeStyle = rgba((1 - d / (LINK * 1.5)) * 0.55);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
          }
        }
      }

      // The motes, twinkling softly.
      for (const m of motes) {
        const glow = 0.55 + 0.45 * Math.sin(m.tw);
        ctx.fillStyle = rgba(0.35 + glow * 0.55);
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }

      // The ripple rings themselves, fading.
      for (const r of ripples) {
        ctx.strokeStyle = rgba(0.35 * (1 - r.age / 90));
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.age * 7, 0, Math.PI * 2); ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };

    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => { const p = local(e); mouse.x = p.x; mouse.y = p.y; mouse.on = true; };
    const onLeave = () => { mouse.on = false; };
    const onDown = (e: PointerEvent) => { const p = local(e); ripples.push({ x: p.x, y: p.y, age: 0 }); if (e.pointerType !== "mouse") { mouse.x = p.x; mouse.y = p.y; mouse.on = true; } };
    const onUp = (e: PointerEvent) => { if (e.pointerType !== "mouse") mouse.on = false; };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", wake);
    wake();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [dark]);

  return <canvas ref={ref} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
