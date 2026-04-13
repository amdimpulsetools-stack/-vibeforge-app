import { Placeholder } from "../placeholder";

export function RolesPermisos() {
  return (
    <div className="kb-article space-y-8">
      <p className="text-[15px] leading-[1.85] text-slate-700">
        REPLACE tiene 4 roles con permisos diferentes. Cada persona que usa el sistema solo ve y hace lo que su rol permite. Esta guía explica qué puede hacer cada rol y cómo gestionar tu equipo.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Los 4 roles del sistema</h2>

      <div className="overflow-x-auto my-6 rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Rol</th>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Agenda</th>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Pacientes</th>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Notas SOAP</th>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Reportes</th>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-bold">👑 Owner</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo + Facturación</td></tr>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-bold">🛡️ Admin</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Todo</td><td className="px-4 py-2.5 text-emerald-600">✅ Sin facturación</td></tr>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-bold">🎧 Recepcionista</td><td className="px-4 py-2.5 text-emerald-600">✅ Crear/editar citas</td><td className="px-4 py-2.5 text-emerald-600">✅ Registrar/editar</td><td className="px-4 py-2.5 text-red-500">❌ No ve</td><td className="px-4 py-2.5 text-red-500">❌ No ve</td><td className="px-4 py-2.5 text-red-500">❌ No ve</td></tr>
            <tr><td className="px-4 py-2.5 font-bold">🩺 Doctor</td><td className="px-4 py-2.5 text-amber-600">⚠️ Solo sus citas</td><td className="px-4 py-2.5 text-emerald-600">✅ Solo sus pacientes</td><td className="px-4 py-2.5 text-emerald-600">✅ Solo las suyas</td><td className="px-4 py-2.5 text-red-500">❌ No ve</td><td className="px-4 py-2.5 text-red-500">❌ No ve</td></tr>
          </tbody>
        </table>
      </div>

      <Placeholder label="Captura: Admin → Miembros mostrando los diferentes roles" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Invitar un nuevo miembro</h2>
      <ol className="space-y-3 text-[15px] text-slate-700 leading-[1.85] list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>Ve a <strong>Admin → Miembros</strong>.</li>
        <li>Haz clic en <strong>"Invitar miembro"</strong>.</li>
        <li>Ingresa el email de la persona y selecciona su rol.</li>
        <li>Haz clic en <strong>"Enviar invitación"</strong>.</li>
        <li>La persona recibirá un email con un link para registrarse. Al hacerlo, automáticamente se une a tu organización con el rol asignado.</li>
      </ol>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Restricciones del rol Doctor</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">El rol Doctor tiene restricciones específicas para proteger la privacidad:</p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Solo ve sus propias citas</strong> en la agenda (no las de otros doctores).</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Solo puede cancelar</strong> sus citas (no reprogramar), y debe escribir un motivo.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Crea notas SOAP, recetas y exámenes</strong> solo para sus propios pacientes.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>No accede</strong> a reportes, configuración ni administración.</li>
      </ul>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Desactivar un miembro</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        En <strong>Admin → Miembros</strong>, cada miembro tiene un botón de desactivación (ícono 🚫). Al desactivarlo, esa persona <strong>no puede iniciar sesión</strong> pero sus datos y registros se mantienen intactos. Puedes reactivarlo en cualquier momento.
      </p>

      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 mt-10">
        <h3 className="text-lg font-bold text-slate-900 mb-2">💡 Consejo</h3>
        <p className="text-sm text-slate-700">
          No elimines miembros que ya crearon notas clínicas o citas. Solo desactívalos. Así mantienes el historial de auditoría completo — quién hizo qué y cuándo.
        </p>
      </div>
    </div>
  );
}
