"use client";

import { useState } from "react";
import { gold } from "@/lib/styles";
import type { Booking } from "@/types/booking";

interface AvailabilityCalendarProps {
  bookings: Booking[];
  closedDates?: string[];
  onSelectDate: (ds: string) => void;
  selectedDate?: string;
}

export function AvailabilityCalendar({
  bookings,
  closedDates = [],
  onSelectDate,
  selectedDate,
}: AvailabilityCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [calMonth, setCalMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const bookedDates = new Set(
    bookings.filter((b) => b.status !== "Cancelled").map((b) => b.date)
  );
  const closedSet = new Set(closedDates);
  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const toStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div
      style={{
        background: "rgba(10,10,10,0.98)",
        border: "1px solid #2a2a2a",
        borderRadius: 8,
        padding: "20px 18px",
        width: "100%",
        maxWidth: 360,
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <button
          onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={{
            background: "none",
            border: "1px solid #2a2a2a",
            color: "#aaa",
            cursor: "pointer",
            borderRadius: 3,
            width: 28,
            height: 28,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ‹
        </button>
        <span
          style={{
            color: "#f0f0f0",
            fontSize: 13,
            fontFamily: "'Cormorant Garamond',Georgia,serif",
          }}
        >
          {calMonth.toLocaleString("default", { month: "long", year: "numeric" })}
        </span>
        <button
          onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={{
            background: "none",
            border: "1px solid #2a2a2a",
            color: "#aaa",
            cursor: "pointer",
            borderRadius: 3,
            width: 28,
            height: 28,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ›
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
          marginBottom: 4,
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            style={{ textAlign: "center", fontSize: 10, color: "#666", padding: "3px 0" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const ds = toStr(d);
          const dayDate = new Date(year, month, d);
          const isPast = dayDate < today;
          const isBooked = bookedDates.has(ds);
          const isClosed = closedSet.has(ds);
          const isSel = selectedDate === ds;
          const disabled = isPast || isBooked || isClosed;
          let bg = "#1e1e1e",
            col = "#bbb",
            bdr = "1px solid #252525",
            cur: string = "pointer";
          if (isPast) { bg = "#0c0c0c"; col = "#333"; cur = "default"; }
          if (isBooked) { bg = "#161616"; col = "#444"; cur = "not-allowed"; }
          if (isClosed) { bg = "#1a0a0a"; col = "#553333"; cur = "not-allowed"; }
          if (isSel) { bg = gold; col = "#000"; bdr = `1px solid ${gold}`; }
          return (
            <div
              key={d}
              onClick={() => !disabled && onSelectDate(ds)}
              style={{
                textAlign: "center",
                padding: "7px 2px",
                borderRadius: 3,
                background: bg,
                border: bdr,
                color: col,
                fontSize: 12,
                cursor: cur,
                fontWeight: isSel ? 700 : 400,
                userSelect: "none",
              }}
            >
              {d}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 14,
          justifyContent: "center",
        }}
      >
        {[
          ["Available", "#bbb"],
          ["Booked", "#444"],
          ["Closed", "#553333"],
          ["Selected", gold],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{ width: 8, height: 8, borderRadius: "50%", background: c }}
            />
            <span style={{ color: "#666", fontSize: 10 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
