import { SessionRegister } from "@/components/auth/session-register";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mount SessionRegister so users in the post-signup pre-dashboard
  // flow (/select-plan, /onboarding, /waiting-for-plan) register
  // their device. Without this the first session row would only be
  // created on /dashboard. The component no-ops for unauthenticated
  // visitors (login/register) — the API returns 401 and it just
  // marks itself registered.
  return (
    <div className="auth-bg min-h-screen">
      <SessionRegister />
      {children}
    </div>
  );
}
