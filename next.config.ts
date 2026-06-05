import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["recharts"],
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
  outputFileTracingIncludes: {
    "/api/budgets/[id]/pdf": ["./lib/budget-pdf/templates/**/*.hbs"],
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_DSN,
  },
});
