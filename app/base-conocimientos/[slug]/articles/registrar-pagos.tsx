import { Placeholder } from "../placeholder";

export function RegistrarPagos() {
  return (
    <div className="kb-article space-y-8">
      <p className="text-[15px] leading-[1.85] text-slate-700">
        REPLACE permite registrar pagos por cita con múltiples métodos de pago, controlar saldos pendientes y enviar recibos y facturas automáticamente por email.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Registrar un pago</h2>
      <ol className="space-y-3 text-[15px] text-slate-700 leading-[1.85] list-decimal pl-6 marker:text-emerald-500 marker:font-bold">
        <li>En la <strong>Agenda</strong>, haz clic en una cita para abrir el sidebar.</li>
        <li>Baja hasta la sección <strong>"Cobros"</strong>.</li>
        <li>Haz clic en <strong>"+ Registrar pago"</strong>.</li>
        <li>Ingresa el <strong>monto</strong> (o haz clic en "Saldo" para llenar automáticamente el pendiente).</li>
        <li>Selecciona el <strong>método de pago</strong>: Efectivo, Yape, Plin, Tarjeta o Transferencia.</li>
        <li>Opcionalmente, agrega un <strong>número de operación</strong>.</li>
        <li>Si el paciente necesita factura, marca <strong>"Enviar también como factura"</strong>.</li>
        <li>Haz clic en <strong>"Registrar"</strong>.</li>
      </ol>

      <Placeholder label="Captura: Formulario de registro de pago en el sidebar" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">¿Qué pasa cuando registras un pago?</h2>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">El pago queda registrado vinculado a la cita y al paciente.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Se envía un <strong>email de recibo</strong> automáticamente al paciente (si tiene email).</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Si marcaste "factura", también se envía el email de factura.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">Se genera una <strong>notificación interna</strong> ("Pago registrado: S/. X — Paciente Y").</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500">El saldo pendiente de la cita se actualiza automáticamente.</li>
      </ul>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Ver deuda de un paciente</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        La deuda de un paciente es visible en varios lugares:
      </p>
      <ul className="space-y-2 text-[15px] text-slate-700 pl-6">
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>En el calendario:</strong> las citas con saldo pendiente muestran un badge rojo con el monto.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>En el sidebar de la cita:</strong> se muestra el total, pagado y pendiente con barra de progreso.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>En la ficha del paciente:</strong> tab "Finanzas" muestra todos los pagos históricos.</li>
        <li className="relative pl-4 before:content-[''] before:absolute before:left-0 before:top-[10px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500"><strong>En reportes:</strong> el reporte financiero muestra cobrado vs pendiente a nivel de la clínica.</li>
      </ul>

      <Placeholder label="Captura: Badge de deuda en tarjeta de cita del calendario" />

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Pagos parciales</h2>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        Puedes registrar pagos parciales. Ejemplo: una consulta cuesta S/. 200. El paciente paga S/. 100 hoy. Registras S/. 100. El sistema muestra S/. 100 pendiente. Cuando regrese, registras los otros S/. 100.
      </p>
      <p className="text-[15px] leading-[1.85] text-slate-700">
        No hay límite de pagos parciales por cita. Cada uno genera su propio recibo.
      </p>

      <h2 className="text-2xl font-extrabold text-slate-900 mt-12 mb-4 pb-3 border-b border-slate-100">Métodos de pago disponibles</h2>
      <div className="overflow-x-auto my-6 rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Método</th>
              <th className="text-left font-semibold text-slate-700 px-4 py-3 text-xs uppercase tracking-wider">Uso</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-medium">💵 Efectivo</td><td className="px-4 py-2.5 text-slate-600">Pago en consultorio</td></tr>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-medium">📱 Yape</td><td className="px-4 py-2.5 text-slate-600">Billetera digital Perú</td></tr>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-medium">📱 Plin</td><td className="px-4 py-2.5 text-slate-600">Billetera digital Perú</td></tr>
            <tr className="border-b border-slate-50"><td className="px-4 py-2.5 font-medium">💳 Tarjeta</td><td className="px-4 py-2.5 text-slate-600">Crédito o débito</td></tr>
            <tr><td className="px-4 py-2.5 font-medium">🏦 Transferencia</td><td className="px-4 py-2.5 text-slate-600">Bancaria / interbancaria</td></tr>
          </tbody>
        </table>
      </div>

      <p className="text-[15px] leading-[1.85] text-slate-700">
        Los métodos de pago se configuran en <strong>Admin → Valores de Búsqueda → Métodos de pago</strong>. Puedes agregar, editar o desactivar métodos según tu necesidad.
      </p>
    </div>
  );
}
