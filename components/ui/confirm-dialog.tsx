"use client";

// Imperative confirm dialog built on Radix AlertDialog.
//
// Replaces the native `confirm()` calls which are blocking, unbranded,
// and fail accessibility. Usage:
//
//   const confirm = useConfirm();
//
//   if (!(await confirm({
//     title: "Eliminar código?",
//     description: "Esta acción no se puede deshacer.",
//     variant: "destructive",
//     confirmText: "Eliminar",
//   }))) return;
//
// Render <ConfirmDialogHost /> ONCE at the app root (already wired in
// the root layout).

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

type ConfirmResolver = (v: boolean) => void;

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<ConfirmResolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const finish = (result: boolean) => {
    setOpen(false);
    if (resolver) {
      resolver(result);
      setResolver(null);
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) finish(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              {opts?.cancelText ?? "Cancelar"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={opts?.variant ?? "default"}
              onClick={() => finish(true)}
            >
              {opts?.confirmText ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(
      "useConfirm must be used within <ConfirmDialogProvider>"
    );
  }
  return ctx.confirm;
}
