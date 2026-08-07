"use client";

import dynamic from "next/dynamic";

// Este wrapper existe solo como frontera cliente para el Server Component de
// /dashboard. El import dinámico está AQUÍ y no en page.tsx a propósito: en
// el App Router, un `await import()` dentro de un Server Component NO saca al
// componente cliente del entrypoint de la ruta (Next lo recolecta igual en el
// client-reference manifest), así que doctor-dashboard —y con él
// framer-motion, ~36 kB gz— seguía entrando en el First Load de TODOS los
// roles. Movido a next/dynamic dentro del componente cliente, el chunk solo
// baja cuando realmente se renderiza el dashboard de doctor.
//
// ssr queda en su valor por defecto (true): el doctor sigue recibiendo el
// mismo HTML renderizado en servidor que antes, sin ningún cambio visual ni
// espera adicional en el primer pintado.
const DoctorDashboard = dynamic(() =>
  import("./doctor-dashboard").then((m) => m.DoctorDashboard),
);

export function DoctorDashboardWrapper({ userName }: { userName: string }) {
  return <DoctorDashboard userName={userName} />;
}
