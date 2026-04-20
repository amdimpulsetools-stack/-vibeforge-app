import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal del Paciente",
  description: "Accede a tus citas y gestiona tu información médica",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {children}
    </div>
  );
}
