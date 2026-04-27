import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Founder Panel — Yenda Platform",
};

export default function FounderPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
