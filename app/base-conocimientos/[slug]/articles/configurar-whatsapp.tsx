import { Placeholder } from "../placeholder";

export function ConfigurarWhatsApp() {
  return (
    <div className="kb-article space-y-8">
      <p className="text-[15px] leading-[1.85] text-slate-700">
        REPLACE envía recordatorios automáticos por WhatsApp 24 horas y 2 horas antes de cada cita. Esta guía explica cómo activar esta funcionalidad paso a paso.
      </p>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800"><strong>Requisito:</strong> Para enviar mensajes automáticos por WhatsApp necesitas una cuenta de WhatsApp Business API configurada con Meta. Esto es diferente de WhatsApp Business personal.</p>
      </div>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">¿Cómo funcionan los recordatorios?</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Cuando creas una cita en REPLACE, el sistema programa automáticamente 2 mensajes de WhatsApp:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>24 horas antes:</strong> mensaje con fecha, hora, doctor, consultorio e indicaciones previas del servicio.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>2 horas antes:</strong> recordatorio corto y directo como último aviso.</li>
      </ul>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Los mensajes se envían automáticamente via un cron job que corre cada día. No necesitas hacer nada — el sistema lo maneja.
      </p>

      <Placeholder label="Captura: Ejemplo de mensaje WhatsApp de recordatorio" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 1: Configura WhatsApp Business API</h2>
      <ol className="space-y-3 text-[15px] text-slate-700 leading-[1.85] list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>Ve a <strong>Settings → WhatsApp</strong> en tu panel de REPLACE.</li>
        <li>Ingresa tu <strong>WABA ID</strong> (WhatsApp Business Account ID) de Meta.</li>
        <li>Ingresa tu <strong>Phone Number ID</strong> y <strong>Access Token</strong>.</li>
        <li>Guarda la configuración. El sistema verificará la conexión.</li>
      </ol>

      <Placeholder label="Captura: Settings → WhatsApp con campos de configuración" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 2: Crea plantillas en Meta</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Meta requiere que cada mensaje de WhatsApp use una <strong>plantilla aprobada</strong>. Necesitas crear al menos 2 plantillas en el Meta Business Manager:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Recordatorio 24h</strong> (categoría: Utilidad)</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Recordatorio 2h</strong> (categoría: Utilidad)</li>
      </ul>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 3: Vincula las plantillas en REPLACE</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        En <strong>Settings → WhatsApp → Plantillas</strong>, vincularás cada plantilla de Meta con el tipo de notificación correspondiente en REPLACE. El sistema tiene un sincronizador que detecta automáticamente tus plantillas aprobadas.
      </p>

      <Placeholder label="Captura: Settings → WhatsApp → Plantillas vinculadas" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paso 4: Activa los recordatorios</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Ve a <strong>Settings → Correos</strong> y busca las plantillas de recordatorio. Asegúrate de que el toggle de WhatsApp esté activado para:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Recordatorio 24 horas</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Recordatorio 2 horas</li>
      </ul>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Desde ese momento, cada cita que se agende enviará recordatorios automáticamente. No necesitas hacer nada más.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Costos de WhatsApp API</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Meta cobra por cada mensaje de plantilla enviado. Los recordatorios de citas son <strong>plantillas de utilidad</strong> y cuestan aproximadamente <strong>$0.02 USD por mensaje</strong> en Perú. Usa nuestra <a href="/calculadora-whatsapp" className="text-emerald-600 font-semibold hover:underline">calculadora de precios de WhatsApp</a> para estimar tu gasto mensual.
      </p>

      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 mt-10">
        <h3 className="text-lg font-bold text-slate-900 mb-2">💡 Tip</h3>
        <p className="text-sm text-slate-700">
          Mientras no configures WhatsApp API, REPLACE sigue enviando recordatorios por <strong>email</strong> automáticamente. No te quedas sin protección contra inasistencias.
        </p>
      </div>
    </div>
  );
}
