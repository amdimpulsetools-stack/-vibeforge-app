import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="mx-auto max-w-md text-center px-6">
        <div className="mb-6 text-8xl font-display font-bold text-primary">
          404
        </div>
        <h1 className="mb-2 text-2xl font-display font-semibold">
          Página no encontrada
        </h1>
        <p className="mb-8 text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Volver al inicio
        </Link>
        <p className="mt-6 text-xs text-muted-foreground">{APP_NAME}</p>
      </div>
    </div>
  );
}
