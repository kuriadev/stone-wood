"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useWidth } from "@/hooks/useWidth";
import { T } from "@/lib/theme";
import { gold, goldBtn } from "@/lib/styles";

interface AboutProps {
  setPage: (p: string) => void;
  onBookWithDate?: (date: string) => void;
  checkDate?: string | null;
}

export function About({
  setPage,
  onBookWithDate,
  checkDate,
}: AboutProps) {
  const { isDark } = useTheme();
  const C = T(isDark);
  const w = useWidth();
  const mob = w < 768;
  const [activeWhy, setActiveWhy] = useState<number | null>(null);


  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      
{/*  HERO SECTION (CINEMATIC + GLOW)  */}
<div
  style={{
    position: "relative",
    height: mob ? 320 : 460,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 24px",
  }}
>
  {/* BACKGROUND BASE */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: isDark
        ? "radial-gradient(circle at 50% 30%, rgba(201,168,76,0.12), transparent 60%), #070604"
        : "radial-gradient(circle at 50% 30%, rgba(201,168,76,0.18), transparent 60%), #f5efe6",
      transition: "all .6s ease",
    }}
  />

  {/* FLOATING GOLD ORBS */}
  <div
    style={{
      position: "absolute",
      width: 420,
      height: 420,
      borderRadius: "50%",
      top: "-20%",
      left: "20%",
      background:
        "radial-gradient(circle, rgba(201,168,76,0.25), transparent 70%)",
      filter: "blur(60px)",
      animation: "floatOrb1 18s ease-in-out infinite",
    }}
  />

  <div
    style={{
      position: "absolute",
      width: 380,
      height: 380,
      borderRadius: "50%",
      bottom: "-25%",
      right: "10%",
      background:
        "radial-gradient(circle, rgba(201,168,76,0.18), transparent 70%)",
      filter: "blur(70px)",
      animation: "floatOrb2 22s ease-in-out infinite",
    }}
  />

  {/* SOFT OVERLAY */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: isDark
        ? "linear-gradient(to top, rgba(5,4,3,0.85), transparent 60%)"
        : "linear-gradient(to top, rgba(255,255,255,0.6), transparent 60%)",
    }}
  />

  {/* CONTENT */}
  <div
    style={{
      position: "relative",
      zIndex: 2,
      textAlign: "center",
      maxWidth: 720,
    }}
  >
    {/* TAG */}
    <div
      style={{
        letterSpacing: 4,
        fontSize: 11,
        color: gold,
        marginBottom: 14,
        opacity: 0.8,
      }}
    >
      OUR STORY
    </div>

    {/* TITLE */}
<h1
  style={{
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: mob ? 38 : 60,
    fontWeight: 400,
    lineHeight: 1.1,
    marginBottom: 12,
    color: isDark ? "#f8f4ee" : "#1a1a1a",
    overflow: "hidden",
  }}
>
  {/* ABOUT (fade + slide) */}
<span
  style={{
    display: "inline-block",
    opacity: 0,
    transform: "translateY(20px)",
    animation: "fadeSlideUp 0.8s ease forwards",
  }}
>
  About{" "}
</span>

{/* STONEWOOD (gold shimmer reveal) */}
<span
  style={{
    display: "inline-block",
    marginLeft: "10px", 
    fontStyle: "italic",
    background:
      "linear-gradient(120deg, #c9a84c 0%, #e8c97a 40%, #fff3c4 50%, #c9a84c 60%, #c9a84c 100%)",
    backgroundSize: "200% auto",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    opacity: 0,
    transform: "translateY(20px)",
    animation:
      "fadeSlideUp 0.8s ease forwards 0.25s, shimmer 2.5s linear 1s infinite",
  }}
>
  StoneWood
</span>
</h1>

    {/* SUB LINE */}
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginTop: 10,
      }}
    >
      <div
        style={{
          width: 40,
          height: 1,
          background: `linear-gradient(to right,transparent,${gold})`,
        }}
      />
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: gold,
          boxShadow: `0 0 12px ${gold}`,
        }}
      />
      <div
        style={{
          width: 40,
          height: 1,
          background: `linear-gradient(to left,transparent,${gold})`,
        }}
      />
    </div>
  </div>

  {/* ANIMATIONS */}
  <style>{`
    @keyframes floatOrb1 {
      0% { transform: translateY(0px) translateX(0px); }
      50% { transform: translateY(30px) translateX(20px); }
      100% { transform: translateY(0px) translateX(0px); }
    }

    @keyframes floatOrb2 {
      0% { transform: translateY(0px) translateX(0px); }
      50% { transform: translateY(-25px) translateX(-15px); }
      100% { transform: translateY(0px) translateX(0px); }
    }
  `}</style>
</div>

      {/* STORY SECTION */}
      <section
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: mob ? "40px 20px" : "70px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ color: C.textB, lineHeight: 1.9, marginBottom: 20 }}>
          StoneWood Private Resort is nestled in the heart of Angono, Rizal —
          a sanctuary where nature and privacy come together.
        </p>

        <p style={{ color: C.textB, lineHeight: 1.9 }}>
          Enjoy private pools, BBQ areas, billiards, videoke, and serene
          surroundings designed for unforgettable experiences.
        </p>
      </section>

     {/* WHY CHOOSE */}
      <section style={{ textAlign: "center", marginBottom: 80 }}>
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 32,
            color: C.textH,
            marginBottom: 40,
          }}
        >
          Why Choose StoneWood
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: mob ? "1fr" : "repeat(3,1fr)",
            gap: 26,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {[
            {
              icon: "🌿",
              title: "Private & Exclusive",
              desc: "Your own private resort experience.",
              details: [
                "No shared guests or overcrowding",
                "Full control of amenities",
                "Perfect for intimate gatherings",
              ],
            },
            {
              icon: "🏝️",
              title: "Premium Amenities",
              desc: "Everything you need in one place.",
              details: [
                "Private swimming pool",
                "BBQ & outdoor dining area",
                "Billiards & videoke entertainment",
              ],
            },
            {
              icon: "🌄",
              title: "Nature Escape",
              desc: "Relax in a peaceful environment.",
              details: [
                "Fresh air & greenery",
                "Quiet and calming atmosphere",
                "Perfect break from city stress",
              ],
            },
          ].map((item, i) => {
            const isActive = activeWhy === i;

            return (
              <div
        key={item.title}
        onClick={() => setActiveWhy(isActive ? null : i)}
        onMouseEnter={(e) => {
          if (isActive) return;

          e.currentTarget.style.transform = "translateY(-8px) scale(1.025)";
          e.currentTarget.style.boxShadow = "0 25px 50px rgba(0,0,0,0.25)";
        }}
        onMouseLeave={(e) => {
          if (isActive) return;

          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.boxShadow = "none";
        }}
        style={{
          padding: mob ? "26px 22px" : "30px 26px",
          borderRadius: 16,
          background: C.bgCard,
          border: `1px solid ${isActive ? gold : C.border}`,
          textAlign: "left",
          cursor: "pointer",
          transition: "all .35s cubic-bezier(.2,.8,.2,1)",
          transform: isActive ? "scale(1.04)" : "scale(1)",
          boxShadow: isActive
            ? `0 20px 40px rgba(0,0,0,0.25)`
            : "none",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* GOLD SWEEP HOVER EFFECT */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "-120%",
            width: "120%",
            height: "100%",
            background:
              "linear-gradient(120deg, transparent, rgba(201,168,76,0.25), transparent)",
            transform: "skewX(-20deg)",
            transition: "all .6s ease",
            pointerEvents: "none",
          }}
          className="hover-sweep"
        />

        {/* ACTIVE GLOW */}
        {isActive && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at top left, rgba(201,168,76,0.18), transparent 60%)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontSize: 28,
              transition: "transform .3s ease",
            }}
            className="icon-anim"
          >
            {item.icon}
          </div>

          <h3
            style={{
              fontSize: 16,
              color: C.textH,
              letterSpacing: 0.5,
            }}
          >
            {item.title}
          </h3>
        </div>

        {/* DESC */}
        <p
          style={{
            fontSize: 13,
            color: C.textB,
            marginTop: 10,
          }}
        >
          {item.desc}
        </p>

        {/* EXPAND */}
        <div
          style={{
            maxHeight: isActive ? 200 : 0,
            overflow: "hidden",
            transition: "all .4s ease",
            opacity: isActive ? 1 : 0,
          }}
        >
          <ul
            style={{
              marginTop: 14,
              paddingLeft: 18,
              color: C.textB,
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            {item.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>

          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: gold,
              letterSpacing: 1.2,
            }}
          >
            TAP AGAIN TO CLOSE
          </div>
        </div>

        {/* CTA */}
        {!isActive && (
          <div
            style={{
              marginTop: 14,
              fontSize: 11,
              letterSpacing: 1.2,
              color: gold,
              opacity: 0.7,
            }}
          >
            TAP TO EXPAND →
          </div>
        )}

        {/* HOVER CSS */}
        <style>{`
          div:hover .hover-sweep {
            left: 120%;
          }

          div:hover .icon-anim {
            transform: scale(1.15) rotate(3deg);
          }
        `}</style>
      </div>
            );
          })}
        </div>
      </section>

      {/* MAP */}
      <section style={{ maxWidth: 1000, margin: "0 auto 70px" }}>
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3247.696684191124!2d121.16214595325307!3d14.531465178389032!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c6d1d76ebad3%3A0x23993af9734ba069!2sStonewood%20Garden%20Private%20Pool!5e0!3m2!1sen!2sph!4v1776880886519!5m2!1sen!2sph"
          width="100%"
          height="350"
          style={{
            border: 0,
            borderRadius: 14,
            filter: isDark ? "grayscale(0.2) brightness(0.85)" : "none",
          }}
          loading="lazy"
        />
      </section>

      {/* CONTACT + CTA */}
      <section
        style={{
          textAlign: "center",
          padding: "60px 20px",
          background: isDark ? "#0a0805" : "#f7f3ea",
        }}
      >
        <h3
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 26,
            marginBottom: 20,
            color: C.textH,
          }}
        >
          Plan Your Escape
        </h3>

        <div style={{ marginBottom: 20 }}>
          <p style={{ color: C.textB }}>📞 +63 912 345 6789</p>
          <p style={{ color: C.textB }}>✉️ hello@stonewoodresort.ph</p>
        </div>

        {/* CTA BUTTON (FIXED LOGIC) */}
        <button
          className="sw-btn sw-hero-cta-glow"
          onClick={() =>
            checkDate && onBookWithDate
              ? onBookWithDate(checkDate)
              : setPage("Book Now")
          }
          style={{
            ...goldBtn,
            padding: "14px 28px",
            letterSpacing: 2,
            fontSize: 12,
            borderRadius: 8,
          }}
        >
          {checkDate ? "CONTINUE BOOKING" : "BOOK YOUR STAY"}
        </button>
      </section>
    </div>
  );
}