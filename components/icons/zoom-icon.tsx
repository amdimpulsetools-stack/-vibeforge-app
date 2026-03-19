/**
 * Zoom brand icon — simplified camera logo.
 * Uses Zoom's brand blue (#2D8CFF) by default.
 */
export function ZoomIcon({ className = "h-4 w-4", color = "#2D8CFF" }: { className?: string; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2" y="5" width="14" height="14" rx="3" fill={color} />
      <path
        d="M18 9.5L22 7V17L18 14.5V9.5Z"
        fill={color}
      />
      <path
        d="M6 10.5H12V14.5H8C6.895 14.5 6 13.605 6 12.5V10.5Z"
        fill="white"
      />
    </svg>
  );
}
