import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["recharts"],
  // El cliente ya no hace tracing (sentry.client.config.ts sin
  // tracesSampleRate); este define elimina además el código de spans del
  // bundle del navegador. Solo cliente: server/edge SÍ trazan al 0.1 y el
  // flag global bundleSizeOptimizations.excludeTracing los rompería.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.DefinePlugin({ __SENTRY_TRACING__: false })
      );
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // Keep puppeteer-core and the chromium binary out of the webpack bundle;
  // Next would otherwise try to inline @sparticuz/chromium's native files
  // and blow up the function size. They run from node_modules at request time.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Vercel's file tracer only follows static imports — our budget PDF route
  // reads templates from disk at runtime, so we have to declare them
  // explicitly or the .hbs file won't be shipped to the function.
  //
  // The @sparticuz/chromium `bin/` directory holds brotli-compressed
  // chromium archives that sparticuz inflates into /tmp at request time.
  // Those binaries are NOT referenced via JS imports, so the tracer skips
  // them even with serverExternalPackages set — the runtime then fails
  // with: "The input directory '/var/task/node_modules/@sparticuz/chromium/bin'
  // does not exist". Force them into the bundle here.
  // ref: https://github.com/Sparticuz/chromium#bundler-configuration
  //
  // El segundo glob es redundante con el primero (`**` casa cero o más
  // directorios), pero se deja explícito: las plantillas de Patricia y
  // sus partials viven en un subdirectorio y un fallo silencioso del
  // tracer se manifestaría en producción como un PDF que no genera.
  outputFileTracingIncludes: {
    "/api/budgets/[id]/pdf": [
      "./lib/budget-pdf/templates/**/*.hbs",
      "./lib/budget-pdf/templates/patricia/**/*.hbs",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    // Same as above — /send genera el PDF cuando el canal es email o
    // whatsapp (necesita el link firmado para el cuerpo del mensaje).
    "/api/budgets/[id]/send": [
      "./lib/budget-pdf/templates/**/*.hbs",
      "./lib/budget-pdf/templates/patricia/**/*.hbs",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_DSN,
  },
  // Tree-shaking de partes del SDK que no usamos: los mensajes de debug del
  // propio Sentry y las rutas de Replay para shadow DOM / iframes (la app no
  // renderiza ninguno de los dos). Recorta el bundle cliente sin cambiar el
  // comportamiento observable.
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
  },
});
