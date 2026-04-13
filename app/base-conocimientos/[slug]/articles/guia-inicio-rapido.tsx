import { Placeholder } from "../placeholder";

export function GuiaInicioRapido() {
  return (
    <div className="kb-article space-y-8">
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Esta guía te llevará desde cero hasta tener tu primera cita agendada en REPLACE en menos de 10 minutos. Sigue los pasos en orden y tendrás tu consultorio digital funcionando hoy mismo.
      </p>

      <Placeholder label="Captura: Dashboard principal después de configurar" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 1: Crea tu cuenta</h2>
      <ol className="space-y-3 text-[15px] text-slate-700 leading-[1.85] list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>Ve a <strong>/register</strong> y regístrate con Google o correo electrónico.</li>
        <li>En el <strong>onboarding</strong>, ingresa tu nombre completo y número de WhatsApp.</li>
        <li>Selecciona tu <strong>especialidad médica</strong> del catálogo (28 especialidades disponibles).</li>
        <li>Elige un plan: <strong>Prueba gratuita de 14 días</strong> (no requiere tarjeta).</li>
      </ol>

      <Placeholder label="Captura: Pantalla de onboarding con select de especialidad" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 2: Configura tu organización</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Ve a <strong>Settings → General</strong> y completa:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Nombre de la clínica:</strong> como quieres que aparezca en recetas, correos y booking.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Dirección:</strong> para incluir en emails de confirmación.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Link de Google Maps:</strong> para que tus pacientes naveguen fácilmente.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Logo:</strong> sube el logo de tu clínica (se muestra en sidebar y emails).</li>
      </ul>

      <Placeholder label="Captura: Settings → General con campos de organización" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 3: Crea tus consultorios</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Ve a <strong>Admin → Consultorios</strong>. Por defecto se crean 2 consultorios. Puedes renombrarlos, agregar más o desactivar los que no uses. Cada consultorio puede tener un horario independiente.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 4: Agrega doctores</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Ve a <strong>Admin → Doctores</strong> y crea el perfil de cada doctor:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Nombre completo y CMP</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Color identificador (se muestra en la agenda)</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Horarios de atención: día, hora inicio, hora fin, consultorio</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Servicios que ofrece</li>
      </ul>

      <Placeholder label="Captura: Admin → Doctores con perfil y horarios" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 5: Crea tus servicios</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Ve a <strong>Admin → Servicios</strong>. Para cada servicio define:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Nombre:</strong> Consulta general, Ecografía, Control prenatal, etc.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Categoría:</strong> agrupa servicios similares.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Precio base:</strong> S/. (se usa para cobros y reportes).</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Duración:</strong> en minutos (múltiplos de 15).</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Instrucciones previas:</strong> ej: "venir en ayunas" (se envía automáticamente en el email de confirmación).</li>
      </ul>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 6: Agenda tu primera cita</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Ve a <strong>Agenda</strong> y haz clic en <strong>"+ Nueva Cita"</strong>. Completa:
      </p>
      <ol className="space-y-2 text-[15px] text-slate-700 list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>Selecciona o crea un paciente (nombre, teléfono, email).</li>
        <li>Elige doctor, servicio y consultorio.</li>
        <li>Selecciona fecha y hora (el sistema detecta conflictos automáticamente).</li>
        <li>Guarda. La cita aparece en el calendario y el paciente recibe un email de confirmación.</li>
      </ol>

      <Placeholder label="Captura: Modal de nueva cita con campos completados" />

      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 mt-10">
        <h3 className="text-lg font-bold text-slate-900 mb-2">🎉 ¡Listo!</h3>
        <p className="text-sm text-slate-700">
          Tu consultorio digital está configurado. Desde aquí puedes explorar las notas clínicas SOAP, los reportes, los recordatorios por WhatsApp y el asistente con IA.
        </p>
      </div>
    </div>
  );
}
