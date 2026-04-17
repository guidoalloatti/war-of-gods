import type { RaceId } from '@war-of-gods/engine';

/**
 * SVG-based race portraits — stylized silhouettes with iconic details.
 * Each race gets a unique portrait with thematic elements.
 */

let portraitCounter = 0;

export function RacePortrait({ raceId, size = 120, className = '' }: { raceId: RaceId; size?: number; className?: string }) {
  const uid = `rp${++portraitCounter}`;

  const portraits: Record<RaceId, JSX.Element> = {
    elf: <ElfPortrait uid={uid} />,
    dwarf: <DwarfPortrait uid={uid} />,
    human: <HumanPortrait uid={uid} />,
    halfelf: <HalfElfPortrait uid={uid} />,
    orc: <OrcPortrait uid={uid} />,
    giant: <GiantPortrait uid={uid} />,
    goblin: <GoblinPortrait uid={uid} />,
    halforc: <HalfOrcPortrait uid={uid} />,
  };

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={raceId}
    >
      <title>{raceId}</title>
      {portraits[raceId]}
    </svg>
  );
}

function ElfPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-elfBg`;
  const crown = `${uid}-elfCrown`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#FFB6C1" /><stop offset="100%" stopColor="transparent" /></radialGradient>
        <linearGradient id={crown} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#B8860B" /></linearGradient>
      </defs>
      <path d="M30 45 Q35 20 50 15 Q65 20 70 45 L68 55 Q60 50 50 48 Q40 50 32 55 Z" fill="#8B6F5C" opacity="0.8" />
      <ellipse cx="50" cy="52" rx="16" ry="18" fill="#F5DEB3" />
      <path d="M33 48 L22 32 L36 45 Z" fill="#F5DEB3" />
      <path d="M67 48 L78 32 L64 45 Z" fill="#F5DEB3" />
      <ellipse cx="44" cy="50" rx="3" ry="2" fill="#4A7C59" />
      <ellipse cx="56" cy="50" rx="3" ry="2" fill="#4A7C59" />
      <circle cx="44" cy="50" r="1" fill="#1a1a1a" />
      <circle cx="56" cy="50" r="1" fill="#1a1a1a" />
      <path d="M40 46 Q44 44 48 46" stroke="#6B4E3D" strokeWidth="0.8" fill="none" />
      <path d="M52 46 Q56 44 60 46" stroke="#6B4E3D" strokeWidth="0.8" fill="none" />
      <path d="M46 58 Q50 60 54 58" stroke="#C4937A" strokeWidth="0.8" fill="none" />
      <path d="M35 35 L38 22 L42 30 L46 18 L50 28 L54 18 L58 30 L62 22 L65 35" fill={`url(#${crown})`} />
      <circle cx="50" cy="24" r="2" fill="#90EE90" />
      <circle cx="42" cy="28" r="1.2" fill="#90EE90" opacity="0.8" />
      <circle cx="58" cy="28" r="1.2" fill="#90EE90" opacity="0.8" />
      <path d="M25 70 Q30 65 35 70 Q30 68 25 70 Z" fill="#4A7C59" opacity="0.6" />
      <path d="M65 70 Q70 65 75 70 Q70 68 65 70 Z" fill="#4A7C59" opacity="0.6" />
      <circle cx="50" cy="72" r="3" fill="#FFD700" opacity="0.8" />
      <path d="M30 65 Q35 60 50 70 Q65 60 70 65 L75 85 Q60 80 50 82 Q40 80 25 85 Z" fill="#2D5A3D" opacity="0.7" />
    </g>
  );
}

function DwarfPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-dwarfBg`;
  const helm = `${uid}-dwarfHelm`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="transparent" /></radialGradient>
        <linearGradient id={helm} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B7355" /><stop offset="100%" stopColor="#5C4033" /></linearGradient>
      </defs>
      <path d="M30 48 Q32 25 50 20 Q68 25 70 48 L65 50 L35 50 Z" fill={`url(#${helm})`} />
      <path d="M33 48 L67 48" stroke="#FFD700" strokeWidth="2" />
      <rect x="47" y="16" width="6" height="8" rx="1" fill="#FFD700" />
      <ellipse cx="50" cy="55" rx="18" ry="14" fill="#DEB887" />
      <ellipse cx="44" cy="52" rx="2.5" ry="2" fill="#4A3728" />
      <ellipse cx="56" cy="52" rx="2.5" ry="2" fill="#4A3728" />
      <circle cx="44" cy="52" r="1" fill="#1a1a1a" />
      <circle cx="56" cy="52" r="1" fill="#1a1a1a" />
      <path d="M39 48 Q44 45 49 48" stroke="#8B4513" strokeWidth="1.5" fill="none" />
      <path d="M51 48 Q56 45 61 48" stroke="#8B4513" strokeWidth="1.5" fill="none" />
      <path d="M48 54 Q50 58 52 54" stroke="#C4937A" strokeWidth="1" fill="#DEB887" />
      <path d="M32 58 Q35 55 40 57 Q45 62 50 65 Q55 62 60 57 Q65 55 68 58 Q65 78 50 82 Q35 78 32 58 Z" fill="#8B4513" />
      <path d="M38 60 Q44 65 50 68 Q56 65 62 60" stroke="#6B3410" strokeWidth="0.7" fill="none" />
      <path d="M40 64 Q45 69 50 72 Q55 69 60 64" stroke="#6B3410" strokeWidth="0.7" fill="none" />
      <path d="M46 59 Q50 61 54 59" stroke="#7A3B10" strokeWidth="0.6" fill="none" />
      <path d="M25 72 Q35 65 50 75 Q65 65 75 72 L78 90 Q60 85 50 87 Q40 85 22 90 Z" fill="#5C4033" opacity="0.8" />
      <circle cx="50" cy="78" r="3" fill="#FFD700" opacity="0.7" />
    </g>
  );
}

function HumanPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-humanBg`;
  const crown = `${uid}-humanCrown`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#4A90E2" /><stop offset="100%" stopColor="transparent" /></radialGradient>
        <linearGradient id={crown} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFD700" /><stop offset="100%" stopColor="#DAA520" /></linearGradient>
      </defs>
      <path d="M32 48 Q34 28 50 22 Q66 28 68 48 Q65 42 50 40 Q35 42 32 48 Z" fill="#5C4033" />
      <ellipse cx="50" cy="52" rx="17" ry="17" fill="#F0D5B8" />
      <ellipse cx="44" cy="50" rx="2.5" ry="2" fill="#4A6FA5" />
      <ellipse cx="56" cy="50" rx="2.5" ry="2" fill="#4A6FA5" />
      <circle cx="44" cy="50" r="1" fill="#1a1a1a" />
      <circle cx="56" cy="50" r="1" fill="#1a1a1a" />
      <path d="M40 46 Q44 44 48 46" stroke="#4A3728" strokeWidth="1" fill="none" />
      <path d="M52 46 Q56 44 60 46" stroke="#4A3728" strokeWidth="1" fill="none" />
      <path d="M49 52 L48 56 L52 56" stroke="#D4A987" strokeWidth="0.8" fill="none" />
      <path d="M45 60 Q50 63 55 60" stroke="#C4937A" strokeWidth="1" fill="none" />
      <path d="M33 38 L36 25 L41 32 L46 22 L50 30 L54 22 L59 32 L64 25 L67 38 Q60 36 50 35 Q40 36 33 38 Z" fill={`url(#${crown})`} />
      <circle cx="50" cy="27" r="2.5" fill="#4A90E2" />
      <circle cx="41" cy="30" r="1.5" fill="#E74C3C" opacity="0.8" />
      <circle cx="59" cy="30" r="1.5" fill="#E74C3C" opacity="0.8" />
      <path d="M28 68 Q38 62 50 68 Q62 62 72 68 L76 90 Q60 82 50 85 Q40 82 24 90 Z" fill="#2C3E6B" opacity="0.8" />
      <path d="M30 70 Q40 65 50 70 Q60 65 70 70" stroke="#FFD700" strokeWidth="1" fill="none" opacity="0.5" />
      <circle cx="50" cy="76" r="3.5" fill="#FFD700" opacity="0.8" />
      <circle cx="50" cy="76" r="2" fill="#4A90E2" opacity="0.6" />
    </g>
  );
}

function HalfElfPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-halfelfBg`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#9B59B6" /><stop offset="100%" stopColor="transparent" /></radialGradient>
      </defs>
      <path d="M30 50 Q33 25 50 18 Q67 25 70 50 Q68 44 62 40 L65 70 L60 65 Q55 42 50 38 Q45 42 40 65 L35 70 L38 40 Q32 44 30 50 Z" fill="#7B5B3A" opacity="0.8" />
      <ellipse cx="50" cy="52" rx="16" ry="17" fill="#F2DCC8" />
      <path d="M33 48 L26 38 L36 46 Z" fill="#F2DCC8" />
      <path d="M67 48 L74 38 L64 46 Z" fill="#F2DCC8" />
      <ellipse cx="44" cy="50" rx="2.5" ry="2" fill="#9B59B6" />
      <ellipse cx="56" cy="50" rx="2.5" ry="2" fill="#9B59B6" />
      <circle cx="44" cy="50" r="1" fill="#1a1a1a" />
      <circle cx="56" cy="50" r="1" fill="#1a1a1a" />
      <path d="M40 46 Q44 44 48 47" stroke="#5C4033" strokeWidth="0.8" fill="none" />
      <path d="M52 47 Q56 44 60 46" stroke="#5C4033" strokeWidth="0.8" fill="none" />
      <path d="M49 53 L48 56 L52 56" stroke="#D4A987" strokeWidth="0.7" fill="none" />
      <path d="M46 59 Q50 61 54 59" stroke="#C4937A" strokeWidth="0.8" fill="none" />
      <path d="M34 40 Q42 35 50 34 Q58 35 66 40" stroke="#C0C0C0" strokeWidth="1.5" fill="none" />
      <circle cx="50" cy="34" r="2.5" fill="#9B59B6" />
      <circle cx="42" cy="36" r="1.2" fill="#C0C0C0" opacity="0.6" />
      <circle cx="58" cy="36" r="1.2" fill="#C0C0C0" opacity="0.6" />
      <path d="M28 68 Q38 60 50 68 Q62 60 72 68 L75 90 Q60 82 50 85 Q40 82 25 90 Z" fill="#4A2D6B" opacity="0.7" />
      <circle cx="50" cy="74" r="2.5" fill="#C0C0C0" opacity="0.7" />
    </g>
  );
}

function OrcPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-orcBg`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#E74C3C" /><stop offset="100%" stopColor="transparent" /></radialGradient>
      </defs>
      <path d="M33 48 Q35 30 50 25 Q65 30 67 48 Q62 40 50 38 Q38 40 33 48 Z" fill="#556B2F" opacity="0.5" />
      <path d="M46 26 Q50 10 54 26" stroke="#2F4F2F" strokeWidth="2" fill="none" />
      <path d="M34 48 Q34 35 50 32 Q66 35 66 48 L64 62 Q58 68 50 70 Q42 68 36 62 Z" fill="#7CAA5A" />
      <ellipse cx="43" cy="48" rx="3" ry="2.5" fill="#8B0000" />
      <ellipse cx="57" cy="48" rx="3" ry="2.5" fill="#8B0000" />
      <circle cx="43" cy="48" r="1.2" fill="#FF4444" />
      <circle cx="57" cy="48" r="1.2" fill="#FF4444" />
      <path d="M37 44 Q43 40 49 44" stroke="#4A6B2F" strokeWidth="2" fill="none" />
      <path d="M51 44 Q57 40 63 44" stroke="#4A6B2F" strokeWidth="2" fill="none" />
      <path d="M47 52 L45 57 Q50 59 55 57 L53 52" stroke="#5A8A3A" strokeWidth="1" fill="#6B9A4A" />
      <path d="M42 62 L40 56 L44 58 Z" fill="#F5F5DC" />
      <path d="M58 62 L60 56 L56 58 Z" fill="#F5F5DC" />
      <path d="M44 62 Q50 65 56 62" stroke="#4A6B2F" strokeWidth="1" fill="none" />
      <path d="M38 44 L42 52" stroke="#5A3A2A" strokeWidth="0.8" opacity="0.6" />
      <path d="M22 72 Q35 62 50 72 Q65 62 78 72 L80 90 Q60 82 50 85 Q40 82 20 90 Z" fill="#4A3728" opacity="0.8" />
      <path d="M28 72 L24 62" stroke="#8B8B8B" strokeWidth="1.5" />
      <path d="M72 72 L76 62" stroke="#8B8B8B" strokeWidth="1.5" />
      <circle cx="50" cy="78" r="3" fill="#F5F5DC" opacity="0.5" />
      <circle cx="48" cy="77" r="0.5" fill="#1a1a1a" />
      <circle cx="52" cy="77" r="0.5" fill="#1a1a1a" />
    </g>
  );
}

function GiantPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-giantBg`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#2C3E50" /><stop offset="100%" stopColor="transparent" /></radialGradient>
      </defs>
      <path d="M28 55 Q30 28 50 22 Q70 28 72 55 L70 65 Q62 72 50 74 Q38 72 30 65 Z" fill="#A08878" />
      <path d="M35 40 Q45 38 55 40" stroke="#8B7765" strokeWidth="0.5" fill="none" opacity="0.5" />
      <path d="M33 50 Q50 48 67 50" stroke="#8B7765" strokeWidth="0.5" fill="none" opacity="0.5" />
      <rect x="39" y="45" width="8" height="5" rx="2" fill="#1a1a1a" opacity="0.4" />
      <rect x="53" y="45" width="8" height="5" rx="2" fill="#1a1a1a" opacity="0.4" />
      <ellipse cx="43" cy="48" rx="2.5" ry="2" fill="#7FDBFF" />
      <ellipse cx="57" cy="48" rx="2.5" ry="2" fill="#7FDBFF" />
      <circle cx="43" cy="48" r="1" fill="white" opacity="0.8" />
      <circle cx="57" cy="48" r="1" fill="white" opacity="0.8" />
      <path d="M36 44 Q43 40 50 43 Q57 40 64 44" stroke="#8B7360" strokeWidth="2.5" fill="none" />
      <path d="M48 52 L46 58 Q50 60 54 58 L52 52" stroke="#907868" strokeWidth="1" fill="#A08878" />
      <path d="M43 63 Q50 66 57 63" stroke="#806858" strokeWidth="1.2" fill="none" />
      <path d="M32 35 L30 20 L38 28 L44 15 L50 25 L56 15 L62 28 L70 20 L68 35" fill="#6B6B6B" opacity="0.7" />
      <path d="M32 35 L68 35" stroke="#8B8B8B" strokeWidth="1" />
      <path d="M18 74 Q35 62 50 74 Q65 62 82 74 L85 95 Q60 85 50 88 Q40 85 15 95 Z" fill="#6B5B4B" opacity="0.8" />
    </g>
  );
}

function GoblinPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-goblinBg`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#27AE60" /><stop offset="100%" stopColor="transparent" /></radialGradient>
      </defs>
      <path d="M28 50 L15 35 L32 46 Z" fill="#7AB648" />
      <path d="M72 50 L85 35 L68 46 Z" fill="#7AB648" />
      <path d="M29 49 L18 37 L33 46" stroke="#5A8A38" strokeWidth="0.5" fill="none" />
      <path d="M71 49 L82 37 L67 46" stroke="#5A8A38" strokeWidth="0.5" fill="none" />
      <ellipse cx="50" cy="50" rx="20" ry="22" fill="#8BC34A" />
      <ellipse cx="42" cy="46" rx="5" ry="4" fill="#FFFF00" />
      <ellipse cx="58" cy="46" rx="5" ry="4" fill="#FFFF00" />
      <ellipse cx="43" cy="46" rx="2" ry="2.5" fill="#1a1a1a" />
      <ellipse cx="59" cy="46" rx="2" ry="2.5" fill="#1a1a1a" />
      <circle cx="42" cy="45" r="0.8" fill="white" opacity="0.6" />
      <circle cx="58" cy="45" r="0.8" fill="white" opacity="0.6" />
      <path d="M48 52 L50 56 L52 52" fill="#6B9A3A" />
      <path d="M40 60 Q45 66 50 64 Q55 66 60 60" stroke="#4A7A2A" strokeWidth="1" fill="none" />
      <path d="M42 60 L43 63 L45 60" fill="#F5F5DC" />
      <path d="M47 61 L48 64 L49 61" fill="#F5F5DC" />
      <path d="M51 61 L52 64 L53 61" fill="#F5F5DC" />
      <path d="M55 60 L57 63 L58 60" fill="#F5F5DC" />
      <path d="M30 42 Q32 28 50 22 Q68 28 70 42 Q65 36 50 34 Q35 36 30 42 Z" fill="#5C4033" opacity="0.6" />
      <path d="M26 70 Q38 62 50 70 Q62 62 74 70 L76 90 Q60 82 50 85 Q40 82 24 90 Z" fill="#3D5C28" opacity="0.7" />
      <path d="M30 72 L26 65" stroke="#8B8B8B" strokeWidth="1.5" />
      <circle cx="26" cy="64" r="1.5" fill="#8B8B8B" />
    </g>
  );
}

function HalfOrcPortrait({ uid }: { uid: string }) {
  const bg = `${uid}-halforcBg`;
  return (
    <g>
      <circle cx="50" cy="50" r="48" fill={`url(#${bg})`} opacity="0.3" />
      <defs>
        <radialGradient id={bg}><stop offset="0%" stopColor="#7F8C8D" /><stop offset="100%" stopColor="transparent" /></radialGradient>
      </defs>
      <path d="M33 48 Q34 28 50 22 Q66 28 67 48 Q64 38 50 35 Q36 38 33 48 Z" fill="#3D3D3D" />
      <path d="M34 48 Q34 35 50 30 Q66 35 66 48 L64 62 Q58 68 50 70 Q42 68 36 62 Z" fill="#8FA880" />
      <ellipse cx="43" cy="48" rx="3" ry="2.2" fill="#DAA520" />
      <ellipse cx="57" cy="48" rx="3" ry="2.2" fill="#DAA520" />
      <circle cx="43" cy="48" r="1.2" fill="#1a1a1a" />
      <circle cx="57" cy="48" r="1.2" fill="#1a1a1a" />
      <path d="M38 44 Q43 42 48 45" stroke="#5A7A4A" strokeWidth="1.5" fill="none" />
      <path d="M52 45 Q57 42 62 44" stroke="#5A7A4A" strokeWidth="1.5" fill="none" />
      <path d="M48 52 L46 57 Q50 59 54 57 L52 52" stroke="#7A9A6A" strokeWidth="0.8" fill="#8FA880" />
      <path d="M44 62 L43 58 L45 60 Z" fill="#F5F5DC" opacity="0.8" />
      <path d="M56 62 L57 58 L55 60 Z" fill="#F5F5DC" opacity="0.8" />
      <path d="M44 62 Q50 64 56 62" stroke="#5A7A4A" strokeWidth="0.8" fill="none" />
      <path d="M60 55 L63 62" stroke="#6A5A4A" strokeWidth="0.8" opacity="0.5" />
      <path d="M25 72 Q38 62 50 72 Q62 62 75 72 L78 90 Q60 82 50 85 Q40 82 22 90 Z" fill="#5A5A5A" opacity="0.8" />
      <path d="M32 76 Q38 73 44 76 Q50 73 56 76 Q62 73 68 76" stroke="#7A7A7A" strokeWidth="0.5" fill="none" />
      <path d="M30 80 Q36 77 42 80 Q48 77 54 80 Q60 77 66 80 Q72 77 74 80" stroke="#7A7A7A" strokeWidth="0.5" fill="none" />
      <path d="M72 68 L78 55" stroke="#8B8B8B" strokeWidth="1.5" />
      <path d="M76 58 Q82 52 78 55 Q80 60 76 58 Z" fill="#8B8B8B" opacity="0.7" />
    </g>
  );
}
