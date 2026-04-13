import { Placeholder } from "../placeholder";

export function ReservaOnline() {
  return (
    <div className="kb-article space-y-8">
      <p className="text-[15px] leading-[1.85] text-slate-700">
        REPLACE genera un link público donde tus pacientes pueden reservar citas online 24/7 sin necesidad de llamar. La cita se sincroniza automáticamente con tu agenda interna.
      </p>

      <Placeholder label="Captura: Página de reserva online vista del paciente" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Cómo funciona</h2>
      <ol className="space-y-3 text-[15px] text-slate-700 leading-[1.85] list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>Tu clínica tiene un <strong>link público</strong> tipo: <code className="text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 text-[13px] font-semibold">tu-app.com/book/tu-clinica</code></li>
        <li>El paciente abre el link y ve los <strong>servicios disponibles</strong>.</li>
        <li>Selecciona un servicio → ve los <strong>doctores</strong> que lo ofrecen.</li>
        <li>Selecciona un doctor → ve los <strong>horarios disponibles</strong> (solo slots libres).</li>
        <li>Ingresa sus datos (nombre, teléfono, email, DNI).</li>
        <li>Confirma la reserva → la cita aparece en tu agenda automáticamente.</li>
        <li>El paciente recibe un <strong>email de confirmación</strong> con todos los detalles.</li>
      </ol>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Activar la reserva online</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        La reserva online se activa automáticamente cuando tienes:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Al menos <strong>1 doctor</strong> con horarios configurados.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Al menos <strong>1 servicio</strong> activo asignado a ese doctor.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">La configuración de <strong>reservas</strong> activada en Settings → Reservas.</li>
      </ul>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Configurar la reserva</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        En <strong>Settings → Reservas</strong> puedes configurar:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Disponibilidad:</strong> cuántos días hacia adelante pueden ver los pacientes.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Intervalo mínimo:</strong> cuántas horas antes de la cita puede reservar (ej: mínimo 2h antes).</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Campos requeridos:</strong> qué datos pides al paciente (DNI, teléfono, email).</li>
      </ul>

      <Placeholder label="Captura: Settings → Reservas con opciones de configuración" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Dónde compartir tu link</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Tu link de booking se puede compartir en cualquier lugar:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">📱 <strong>WhatsApp:</strong> respuesta rápida cuando un paciente pregunta por cita.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">📸 <strong>Instagram bio:</strong> "Reserva tu cita → [link]".</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">🌐 <strong>Tu página web:</strong> botón "Reservar cita" que abre el link.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">🎴 <strong>Tarjeta de presentación:</strong> código QR que apunta al link.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">📣 <strong>Publicidad:</strong> anuncios de Facebook/Instagram con link directo.</li>
      </ul>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Sincronización con la agenda</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Las reservas online se sincronizan <strong>en tiempo real</strong> con tu agenda:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Si un horario está ocupado en tu agenda, el paciente <strong>no lo ve</strong> como disponible.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Si hay un bloqueo de horario (vacaciones, almuerzo), tampoco aparece.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Al reservar, la cita aparece <strong>inmediatamente</strong> en tu agenda con estado "Agendada".</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Si el paciente es nuevo, se crea automáticamente su ficha en el directorio.</li>
      </ul>

      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 mt-10">
        <h3 className="text-lg font-bold text-slate-900 mb-2">💡 Dato útil</h3>
        <p className="text-sm text-slate-700">
          Las clínicas con booking online reducen llamadas a recepción hasta en un <strong>60%</strong> y tienen tasas de no-show <strong>23% menores</strong> que las que solo agendan por teléfono.
        </p>
      </div>
    </div>
  );
}
