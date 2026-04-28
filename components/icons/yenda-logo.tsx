import Image from "next/image";

/**
 * Yenda brand logo (horizontal lockup: word "Yenda" + spark mark).
 * Used in navbar, auth pages headers, and footer.
 *
 * The asset lives in /public/yenda/logo.svg (copied from
 * components/icons/Yenda logo.svg during the v0.13.6 rebrand).
 *
 * Default proportions: width 120, height ~34. Pass `width` to scale.
 */
export function YendaLogo({
  width = 120,
  height,
  className,
  priority,
}: {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  // The SVG natural ratio is 394.85 x 137.32 ≈ 2.875:1
  const computedHeight = height ?? Math.round(width / 2.875);
  return (
    <Image
      src="/yenda/logo.svg"
      alt="Yenda"
      width={width}
      height={computedHeight}
      className={className}
      priority={priority}
    />
  );
}

/**
 * Square mark with rounded corners (favicon-style).
 * For app icons, OG fallbacks, sidebars, and small spaces.
 */
export function YendaMark({
  size = 32,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/yenda/favicon.svg"
      alt="Yenda"
      width={size}
      height={size}
      className={className}
      priority={priority}
    />
  );
}
