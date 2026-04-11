"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileNavContextValue {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider
      value={{ isOpen, setOpen, toggle: () => setOpen(!isOpen) }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    // Fallback to no-op if provider is missing
    return { isOpen: false, setOpen: () => {}, toggle: () => {} };
  }
  return ctx;
}
