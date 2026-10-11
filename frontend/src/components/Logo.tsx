import type { SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
}

/**
 * Custom Bespoke Logo for Bhumi Vikas Sahayak.
 * 
 * Incorporates:
 * 1. Madhya Pradesh's iconic architectural Torana gateway arch at the crown.
 * 2. Stepped modern urban development blocks ("Vikas").
 * 3. A calibrated land plot baseline & blueprint grid ("Bhumi").
 * 4. Campus-Connect warm orange and golden sun palette.
 */
export function BhumiLogoMark({ size = 40, className = '', ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="Bhumi Vikas Sahayak Logo"
      {...props}
    >
      <defs>
        {/* Main Brand Saturated Orange Gradient */}
        <linearGradient id="bvs-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F2802B" />
          <stop offset="60%" stopColor="#EF7B45" />
          <stop offset="100%" stopColor="#DB551D" />
        </linearGradient>

        {/* Radiant Sunrise Gold Gradient */}
        <linearGradient id="bvs-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>

        {/* Soft Drop Shadow for Depth */}
        <filter id="bvs-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#9A3412" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Campus-Connect Squircle Container */}
      <rect width="64" height="64" rx="17" fill="url(#bvs-bg-grad)" />
      
      {/* Subtle Inner Highlight Rim */}
      <rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="16"
        fill="none"
        stroke="rgba(255, 255, 255, 0.28)"
        strokeWidth="1.2"
      />

      {/* ── Brand Symbol ── */}
      <g filter="url(#bvs-glow)">
        {/* Golden Sun Disc / Dawn of Development */}
        <circle cx="32" cy="11.5" r="3.5" fill="url(#bvs-gold-grad)" />

        {/* Torana Crown / Upper Gateway Beam */}
        <path
          d="M 17 17.5 C 17 16.5 18 16 19.5 16 L 44.5 16 C 46 16 47 16.5 47 17.5 C 47 18.5 46 19 44.5 19 L 19.5 19 C 18 19 17 18.5 17 17.5 Z"
          fill="#FFFFFF"
        />
        {/* Curved Ornamental Finials on Gateway Beam */}
        <circle cx="17.5" cy="17.5" r="1.8" fill="url(#bvs-gold-grad)" />
        <circle cx="46.5" cy="17.5" r="1.8" fill="url(#bvs-gold-grad)" />

        {/* Second Torana Crossbeam */}
        <rect x="20" y="21" width="24" height="2.5" rx="1.2" fill="#FFFFFF" fillOpacity="0.9" />

        {/* Left Stepped Wing (Low-rise Zone) */}
        <path d="M 15 36 H 21 V 45 H 15 Z" fill="#FFFFFF" fillOpacity="0.8" />
        <line x1="18" y1="38" x2="18" y2="43" stroke="#EF7B45" strokeWidth="1.2" strokeLinecap="round" />

        {/* Right Stepped Wing (Commercial Zone) */}
        <path d="M 43 36 H 49 V 45 H 43 Z" fill="#FFFFFF" fillOpacity="0.8" />
        <line x1="46" y1="38" x2="46" y2="43" stroke="#EF7B45" strokeWidth="1.2" strokeLinecap="round" />

        {/* Central Rising Development Tower */}
        <path d="M 23 25.5 H 41 V 45 H 23 Z" fill="#FFFFFF" />

        {/* Central Gateway Archway / Portal */}
        <path
          d="M 29 45 V 36.5 C 29 34.8 30.3 33.5 32 33.5 C 33.7 33.5 35 34.8 35 36.5 V 45 Z"
          fill="#DB551D"
        />

        {/* Blueprint Vertical Pilasters */}
        <line x1="25.5" y1="27" x2="25.5" y2="43" stroke="#EF7B45" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="38.5" y1="27" x2="38.5" y2="43" stroke="#EF7B45" strokeWidth="1.2" strokeLinecap="round" />

        {/* Solid Foundation / Bhumi Base Ground Line */}
        <rect x="11" y="47" width="42" height="3" rx="1.5" fill="#FFFFFF" />

        {/* Blueprint Measurement / Setback Cadastral Grid */}
        <line x1="14" y1="52.5" x2="50" y2="52.5" stroke="url(#bvs-gold-grad)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.5 2.5" />
        <circle cx="14" cy="52.5" r="1.2" fill="url(#bvs-gold-grad)" />
        <circle cx="32" cy="52.5" r="1.2" fill="url(#bvs-gold-grad)" />
        <circle cx="50" cy="52.5" r="1.2" fill="url(#bvs-gold-grad)" />
      </g>
    </svg>
  )
}

/**
 * Full Brand Identity with the Logo Mark + Typographic Wordmark.
 */
export function BhumiBrandLogo({
  size = 42,
  subtitle = 'MP Bhumi Vikas · 2012',
}: {
  size?: number
  subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0 rounded-2xl shadow-[0_6px_18px_rgba(239,123,69,0.32)] transition-transform duration-200 hover:scale-105">
        <BhumiLogoMark size={size} />
      </div>
      <div className="min-w-0">
        <h1 className="font-heading font-extrabold text-[17px] text-[#1F1A17] tracking-tight leading-none">
          Bhumi Vikas <span className="text-[#C2410C]">Sahayak</span>
        </h1>
        <p className="text-[11px] font-bold text-[#8A7968] mt-1 font-mono tracking-tight flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#5BA869]" />
          <span>{subtitle}</span>
        </p>
      </div>
    </div>
  )
}
