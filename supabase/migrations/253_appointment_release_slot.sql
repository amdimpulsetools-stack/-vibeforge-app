-- 253: Agenda — "Liberar hueco" al finalizar antes + hora de fin editable
--
-- Caso de la Dra. Patricia (8-sep-2026): consulta de 45 min que termina a
-- los 20. Se pulsa "Finalizar" pero el bloque sigue ocupando sus 45 min en
-- el calendario y en el control de choques, así que no se puede encajar
-- una cita imprevista ni rodar la siguiente. Hasta hoy la hora de fin solo
-- se fijaba al crear (duración personalizada, mig 221); Reprogramar
-- conserva la duración y Editar no la toca.
--
-- La liberación acorta `end_time` (la agenda interna y el copiar-horarios
-- ven el hueco al instante). Lo que la clínica NO quiere todavía es que
-- ese hueco aparezca en la reserva online: para eso esta columna guarda
-- hasta cuándo sigue "ocupado" de cara al público.
--
--   online_busy_until  hora de fin ORIGINAL cuando se liberó el hueco.
--                      NULL = sin liberación; la reserva online usa
--                      GREATEST(end_time, COALESCE(online_busy_until, end_time)).
--                      Se limpia si la cita se vuelve a alargar más allá.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS online_busy_until time;

COMMENT ON COLUMN appointments.online_busy_until IS
  'Mig 253: hora de fin original al "liberar hueco" tras finalizar antes. La reserva online sigue viendo ocupado hasta esta hora; la agenda interna usa end_time.';
