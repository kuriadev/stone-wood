"use client";

import { useState } from "react";

interface StarsProps {
  rating: number;
  interactive?: boolean;
  onRate?: (r: number) => void;
  size?: number;
}

export function Stars({ rating, interactive = false, onRate, size = 16 }: StarsProps) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          onClick={() => interactive && onRate && onRate(i)}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{
            fontSize: size,
            cursor: interactive ? "pointer" : "default",
            color: (hover || rating) >= i ? "#f5c518" : "#555",
            transition: "color .1s",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
