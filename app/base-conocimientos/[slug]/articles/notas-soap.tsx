import { Placeholder } from "../placeholder";

export function NotasSOAP() {
  return (
    <div className="kb-article space-y-8">
      <p className="text-[15px] leading-[1.85] text-slate-700">
        REPLACE incluye un editor de notas clínicas en formato SOAP (Subjetivo, Objetivo, Análisis, Plan) con autocompletado de diagnósticos CIE-10, signos vitales, plantillas reutilizables y firma digital.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Cómo acceder al editor SOAP</h2>
      <ol className="space-y-3 text-[15px] text-slate-700 leading-[1.85] list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>En la <strong>Agenda</strong>, haz clic en cualquier cita.</li>
        <li>En el sidebar de la cita, haz clic en <strong>"Historia Clínica"</strong>.</li>
        <li>Se abre el modal con el editor SOAP a la izquierda y los paneles clínicos a la derecha.</li>
      </ol>

      <Placeholder label="Captura: Modal de nota clínica con SOAP a la izquierda" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Las 4 secciones del SOAP</h2>

      <h3 className="text-xl font-bold text-slate-900 mt-8 mb-3">🔵 S — Subjetivo</h3>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Escribe lo que el paciente te cuenta: motivo de consulta, síntomas, duración, intensidad. Es texto libre — documenta en las palabras del paciente.
      </p>

      <h3 className="text-xl font-bold text-slate-900 mt-8 mb-3">🟢 O — Objetivo</h3>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Lo que tú observas y mides. Debajo del editor de texto hay un panel colapsable de <strong>Signos Vitales</strong> con campos para: peso, talla, temperatura, PA sistólica/diastólica, FC, FR, SpO2.
      </p>

      <Placeholder label="Captura: Panel de signos vitales expandido" />

      <h3 className="text-xl font-bold text-slate-900 mt-8 mb-3">🟡 A — Análisis</h3>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Aquí colocas tu diagnóstico. REPLACE incluye un buscador de <strong>CIE-10 con autocompletado</strong>: escribe "cervicalgia" y el sistema sugiere "M54.2 — Cervicalgia". Selecciona y se guarda automáticamente.
      </p>

      <Placeholder label="Captura: Autocompletado CIE-10 en acción" />

      <h3 className="text-xl font-bold text-slate-900 mt-8 mb-3">🟣 P — Plan</h3>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Documenta el tratamiento: medicamentos, exámenes, referidos, indicaciones y seguimiento. En el panel derecho puedes crear prescripciones y órdenes de exámenes directamente desde aquí.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Usar plantillas</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        En la parte superior del editor hay un botón <strong>"Aplicar plantilla"</strong>. Al hacer clic, se despliega un selector con las plantillas disponibles. Selecciona una y los campos S/O/A/P se pre-llenan con el contenido de la plantilla. Luego personalizas lo que necesites.
      </p>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Para crear plantillas, ve a <strong>Admin → Plantillas Clínicas</strong>. Puedes crear plantillas globales (para toda la clínica) o personales (solo tuyas).
      </p>

      <Placeholder label="Captura: Selector de plantillas clínicas" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Firma digital</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Cuando terminas de documentar, haz clic en <strong>"Firmar nota clínica"</strong>. Se muestra una confirmación: <em>"¿Firmar esta nota clínica? Una vez firmada no podrá ser editada."</em>
      </p>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Al firmar, la nota queda <strong>bloqueada permanentemente</strong>. Nadie puede editarla (ni siquiera el admin). Si necesitas agregar algo posterior, se crea un addendum vinculado a la nota original.
      </p>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800"><strong>Importante:</strong> Al firmar la nota, también se bloquean las prescripciones y órdenes de exámenes de esa cita. No se pueden crear nuevas (pero sí se puede marcar resultados de exámenes como completados y suspender prescripciones por seguridad).</p>
      </div>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Auto-guardado</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        El editor guarda automáticamente cada 30 segundos mientras escribes. Verás un indicador de estado en la esquina que dice "Guardando..." → "Guardado" → icono de nube. Si pierdes conexión, la nota se guardará cuando reconectes.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Paneles clínicos (lado derecho)</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        En el layout de 2 columnas del modal, el lado derecho muestra:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Prescripciones:</strong> crear recetas con dosis, vía, frecuencia. Botón imprimir.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Órdenes de exámenes:</strong> seleccionar del catálogo o escribir manualmente. Botón imprimir.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Planes de tratamiento:</strong> crear planes multi-sesión con progreso.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>Seguimientos:</strong> crear seguimientos con prioridad (urgente/moderado/rutina).</li>
      </ul>

      <Placeholder label="Captura: Panel derecho con prescripciones y exámenes" />
    </div>
  );
}
