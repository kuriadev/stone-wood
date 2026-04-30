"use client";

export default function Loading() {
  return (
    <div
      style={{
        padding: "40px 24px",
        animation: "fadeIn 0.3s ease",
      }}
    >
      {/* HERO SKELETON */}
      <div
        style={{
          height: "70vh",
          borderRadius: 16,
          background: "linear-gradient(90deg,#1a1814,#2a251d,#1a1814)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.4s infinite",
          marginBottom: 40,
        }}
      />

      {/* CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            style={{
              height: 200,
              borderRadius: 12,
              background: "linear-gradient(90deg,#1a1814,#2a251d,#1a1814)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.4s infinite",
            }}
          />
        ))}
      </div>




      {/* STYLES */}
      <style jsx>{`
        .sw-loading {
          min-height: 100vh;
          background: #0b0a07;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.4s ease;
        }

        .sw-loading-inner {
          width: 100%;
          max-width: 900px;
          padding: 40px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
        }

        /* LOGO */
        .sw-loading-logo {
          font-family: 'Cormorant Garamond', serif;
          letter-spacing: 6px;
          font-size: 24px;
          color: #c9a84c;
          opacity: 0.9;
        }

        /* SKELETON BASE */
        .shimmer {
          position: relative;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.05);
        }

        .shimmer::after {
          content: "";
          position: absolute;
          top: 0;
          left: -150%;
          width: 150%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(201, 168, 76, 0.25),
            transparent
          );
          animation: shimmer 1.6s infinite;
        }

        /* TITLE */
        .sw-loading-title {
          width: 320px;
          height: 28px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.06);
          position: relative;
          overflow: hidden;
        }

        .sw-loading-title::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(201,168,76,0.25),
            transparent
          );
          animation: shimmer 1.5s infinite;
        }

        /* SUBTITLE */
        .sw-loading-subtitle {
          width: 260px;
          height: 16px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }

        .sw-loading-subtitle::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(201,168,76,0.2),
            transparent
          );
          animation: shimmer 1.6s infinite;
        }

        /* CARD */
        .sw-loading-card {
          margin-top: 20px;
          width: 100%;
          max-width: 520px;
          padding: 20px;
          border-radius: 14px;
          border: 1px solid rgba(201,168,76,0.15);
          background: rgba(255,255,255,0.02);
          display: flex;
          gap: 12px;
        }

        .sw-loading-input {
          flex: 1;
          height: 42px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          position: relative;
          overflow: hidden;
        }

        .sw-loading-input::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(201,168,76,0.25),
            transparent
          );
          animation: shimmer 1.5s infinite;
        }

        .sw-loading-btn {
          width: 140px;
          height: 42px;
          border-radius: 8px;
          background: rgba(201,168,76,0.25);
          position: relative;
          overflow: hidden;
        }

        .sw-loading-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,0.3),
            transparent
          );
          animation: shimmer 1.3s infinite;
        }

        /* ANIMATIONS */
        @keyframes shimmer {
          100% {
            transform: translateX(150%);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}