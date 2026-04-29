export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient brand glow — subtle dark theme accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/[0.08] blur-[120px]" />
        <div className="absolute right-[-10%] top-[40%] h-[400px] w-[400px] rounded-full bg-violet-500/[0.06] blur-[120px]" />
      </div>

      <div className="relative">{children}</div>
    </div>
  );
}
