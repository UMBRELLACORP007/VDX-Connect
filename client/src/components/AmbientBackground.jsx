import './AmbientBackground.css';

// Pure CSS animation (transform + opacity only — no layout thrash, no JS
// rAF loop) so this never competes with WebRTC decode, remote-input
// handling, or file-transfer work for main-thread time. Everything here is
// decorative and sits behind pointer-events: none.
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-grid" />
      <div className="ambient-blob ambient-blob--a" />
      <div className="ambient-blob ambient-blob--b" />
      <div className="ambient-blob ambient-blob--c" />
      <div className="ambient-particles">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="ambient-particle" style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            animationDelay: `${(i % 12) * 0.9}s`,
            animationDuration: `${14 + (i % 7) * 2}s`,
          }} />
        ))}
      </div>
      <div className="ambient-vignette" />
    </div>
  );
}
