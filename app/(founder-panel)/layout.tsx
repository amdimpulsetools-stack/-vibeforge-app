import type { Metadata } from "next";
import { SessionRegister } from "@/components/auth/session-register";

export const metadata: Metadata = {
  title: "Founder Panel — Yenda Platform",
};

export default function FounderPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SessionRegister />
      {children}
    </>
  );
}
