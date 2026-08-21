/**
 * Decorative hero illustration for the dashboard.
 * Pure inline SVG so it scales crisply and needs no raster asset.
 */
export default function HeroArt({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 360"
      className={className}
      role="presentation"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Soft cloud backdrop ── */}
      <g opacity="0.55" fill="#F9DFC9">
        <ellipse cx="196" cy="96" rx="72" ry="46" />
        <ellipse cx="262" cy="70" rx="56" ry="38" />
        <ellipse cx="330" cy="96" rx="70" ry="44" />
        <ellipse cx="120" cy="150" rx="52" ry="32" />
        <ellipse cx="424" cy="204" rx="60" ry="38" />
        <ellipse cx="150" cy="268" rx="58" ry="34" />
      </g>
      <g opacity="0.45" fill="#FCEDDF">
        <ellipse cx="250" cy="150" rx="150" ry="104" />
        <ellipse cx="392" cy="120" rx="60" ry="40" />
      </g>

      {/* ── Browser window with code glyph ── */}
      <g>
        <rect x="196" y="60" width="248" height="152" rx="22" fill="#FFFCF8" stroke="#F6D6BE" strokeWidth="2" />
        <rect x="196" y="60" width="248" height="34" rx="22" fill="#FDEBDC" />
        <rect x="196" y="82" width="248" height="12" fill="#FDEBDC" />
        <circle cx="221" cy="77" r="5" fill="#F4744C" />
        <circle cx="239" cy="77" r="5" fill="#FBBF24" />
        <circle cx="257" cy="77" r="5" fill="#F8C9AE" />
        {/* </> glyph */}
        <g stroke="#F26B43" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M296 130 L276 152 L296 174" />
          <path d="M344 130 L364 152 L344 174" />
          <path d="M328 124 L312 180" />
        </g>
      </g>

      {/* ── Chat / insight bubble ── */}
      <g>
        <rect x="398" y="92" width="94" height="72" rx="20" fill="#FBBF24" />
        <path d="M418 164 L432 164 L421 180 Z" fill="#FBBF24" />
        <g stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" opacity="0.95">
          <path d="M416 116 H474" />
          <path d="M416 132 H460" />
          <path d="M416 148 H468" />
        </g>
      </g>

      {/* ── Donut chart tile ── */}
      <g>
        <rect x="74" y="196" width="122" height="122" rx="28" fill="#FFFCF8" stroke="#F6D6BE" strokeWidth="2" />
        <circle cx="135" cy="257" r="36" stroke="#FDE1CC" strokeWidth="17" />
        <circle
          cx="135"
          cy="257"
          r="36"
          stroke="#F26B43"
          strokeWidth="17"
          strokeLinecap="round"
          strokeDasharray="170 226"
          transform="rotate(-90 135 257)"
        />
      </g>

      {/* ── Bar chart tile ── */}
      <g>
        <rect x="292" y="228" width="122" height="106" rx="26" fill="#FFFCF8" stroke="#F6D6BE" strokeWidth="2" />
        <g strokeLinecap="round" strokeWidth="15">
          <path d="M322 306 V286" stroke="#FBD2B8" />
          <path d="M352 306 V266" stroke="#F58A5E" />
          <path d="M382 306 V248" stroke="#F26B43" />
        </g>
      </g>

      {/* ── Small equals / list marks ── */}
      <g stroke="#F8C9AE" strokeWidth="9" strokeLinecap="round">
        <path d="M228 250 H252" />
        <path d="M228 272 H244" />
      </g>

      {/* ── Plant leaves ── */}
      <g fill="#FBD2B8">
        <path d="M470 300 C470 262 448 236 424 228 C428 268 444 292 470 300 Z" />
        <path d="M470 300 C486 268 486 240 476 220 C458 246 456 276 470 300 Z" />
        <path d="M470 300 C494 292 508 270 510 246 C486 256 472 276 470 300 Z" />
      </g>
      <path d="M470 302 V332" stroke="#F4A97C" strokeWidth="5" strokeLinecap="round" />

      {/* ── Sparkles ── */}
      <g fill="#FBBF24">
        <path d="M168 118 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" />
        <path d="M462 60 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" />
        <path d="M254 322 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" opacity="0.8" />
      </g>
    </svg>
  );
}
