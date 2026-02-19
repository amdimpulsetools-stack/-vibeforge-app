import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto max-w-2xl text-center px-4">
        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
            </svg>
          </div>
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-foreground">
          {APP_NAME}
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          Tu aplicación full-stack construida con Next.js, Supabase y
          shadcn/ui. Lista para producción.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Iniciar Sesión
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Registrarse
          </Link>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          Generado con VibeForge — Next.js 15 + Supabase + TypeScript
        </p>
      </div>
    </div>
  );
}
