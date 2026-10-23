import styles from "./landing.module.css";

export function KnowledgeOrbit() {
  return (
    <div className={styles.orbit} aria-hidden="true">
      <svg viewBox="0 0 900 900" fill="none">
        <defs>
          <radialGradient id="orbit-glow"><stop stopColor="var(--sf-accent)" stopOpacity=".32" /><stop offset="1" stopColor="var(--sf-accent)" stopOpacity="0" /></radialGradient>
          <linearGradient id="orbit-line" x1="120" y1="50" x2="760" y2="830" gradientUnits="userSpaceOnUse"><stop stopColor="var(--sf-accent)" stopOpacity=".8" /><stop offset=".5" stopColor="var(--sf-accent)" stopOpacity=".18" /><stop offset="1" stopColor="var(--sf-accent)" stopOpacity=".02" /></linearGradient>
        </defs>
        <circle cx="450" cy="450" r="430" fill="url(#orbit-glow)" />
        <g stroke="url(#orbit-line)" strokeWidth=".8" transform="rotate(-28 450 450)">
          <circle cx="450" cy="450" r="300" />
          {Array.from({ length: 13 }, (_, index) => <ellipse key={`meridian-${index}`} cx="450" cy="450" rx={24 + index * 22} ry="300" transform={`rotate(${index * 14} 450 450)`} />)}
          {[-240, -180, -120, -60, 0, 60, 120, 180, 240].map((offset) => <ellipse key={offset} cx="450" cy={450 + offset} rx={Math.sqrt(90000 - offset * offset)} ry="40" />)}
          <ellipse cx="450" cy="450" rx="410" ry="110" strokeWidth="1.2" />
          <ellipse cx="450" cy="450" rx="374" ry="143" transform="rotate(60 450 450)" strokeDasharray="3 8" />
        </g>
        <g fill="var(--sf-accent)"><circle cx="143" cy="588" r="4" /><circle cx="678" cy="236" r="5" /><circle cx="732" cy="553" r="3" /></g>
        <g fontFamily="monospace" fontSize="11" fill="var(--sf-ink-muted)" opacity=".7"><text x="128" y="621">01 / KNOWLEDGE</text><text x="689" y="220">02 / PRACTICE</text><text x="685" y="587">03 / UNDERSTAND</text></g>
      </svg>
    </div>
  );
}

