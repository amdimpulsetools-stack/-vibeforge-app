"use client";

import { DoctorDashboard } from "./doctor-dashboard";

export function DoctorDashboardWrapper({ userName }: { userName: string }) {
  return <DoctorDashboard userName={userName} />;
}
