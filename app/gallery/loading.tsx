export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "40px 24px",
        background: "#0b0a07",
      }}
    >
      {/* HERO */}
      <div className="lux-skeleton hero" />

      {/* TEXT */}
      <div className="lux-line w-60" />
      <div className="lux-line w-40" />
      <div className="lux-line w-30" />

      {/* CARDS */}
      <div className="lux-grid">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="lux-card">
            <div className="lux-img" />
            <div className="lux-line w-70" />
            <div className="lux-line w-50" />
            <div className="lux-btn" />
          </div>
        ))}
      </div>
    </div>
  );
}