interface GradientMusicIconProps {
  className?: string
}

// Lucide Music icon paths with a gradient stroke matching Jellyfin's purple→cyan palette
export function GradientMusicIcon({ className = 'w-6 h-6' }: GradientMusicIconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <defs>
        <linearGradient id="music-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#775BF4" />
          <stop offset="100%" stopColor="#00A4DC" />
        </linearGradient>
      </defs>
      <path stroke="url(#music-grad)" d="M9 18V5l12-2v13" />
      <circle stroke="url(#music-grad)" cx="6" cy="18" r="3" />
      <circle stroke="url(#music-grad)" cx="18" cy="16" r="3" />
    </svg>
  )
}
