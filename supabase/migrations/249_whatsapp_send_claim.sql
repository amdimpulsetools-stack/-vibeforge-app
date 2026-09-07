-- 249: idempotencia real en los envíos de WhatsApp por cita
--
-- El guard anterior era "leer y después escribir": /api/notifications/send
-- consultaba whatsapp_message_logs buscando un envío reciente de la MISMA
-- plantilla a la MISMA cita y, si no lo encontraba, llamaba a Meta y recién
-- entonces insertaba la fila. Entre la lectura y el insert pasan ~1 s (la
-- llamada a la Graph API), así que dos disparos casi simultáneos —crear una
-- cita ya "confirmada" dispara la notificación desde el formulario Y desde el
-- cambio de estado; un doble clic hace lo mismo— leían los dos "no hay nada"
-- y el paciente recibía el mensaje duplicado.
--
-- Reproducido en producción el 7-sep-2026 (org DemoClinic): dos filas con la
-- misma cita y la misma plantilla, 05:15:22.263 y 05:15:23.548 UTC.
--
-- La solución es reservar el envío ANTES de llamar a Meta: se inserta la fila
-- en estado 'sending' y un índice único parcial deja pasar una sola reserva
-- viva por (cita, plantilla). El segundo disparo choca contra el índice
-- (23505) y se descarta. Al terminar, la fila pasa a 'sent' (o 'failed') y
-- libera el índice; a partir de ahí manda el guard de 10 minutos del código,
-- que sigue permitiendo reenvíos legítimos más tarde (cancelar y volver a
-- confirmar días después).

-- 1) 'sending' como estado válido del ciclo de vida.
alter table whatsapp_message_logs
  drop constraint if exists whatsapp_message_logs_status_check;

alter table whatsapp_message_logs
  add constraint whatsapp_message_logs_status_check
  check (status = any (array['sending', 'sent', 'delivered', 'read', 'failed']));

-- 2) Una sola reserva viva por cita + plantilla.
create unique index if not exists whatsapp_message_logs_inflight_uniq
  on whatsapp_message_logs (appointment_id, template_id)
  where status = 'sending'
    and appointment_id is not null
    and template_id is not null;

-- 3) Índice de apoyo para el guard de 10 minutos (y para el barrido de
--    reservas vencidas), que filtra por cita + plantilla + fecha.
create index if not exists whatsapp_message_logs_appt_tpl_idx
  on whatsapp_message_logs (appointment_id, template_id, created_at desc)
  where appointment_id is not null;

comment on index whatsapp_message_logs_inflight_uniq is
  'Idempotencia de envío: bloquea el segundo disparo mientras el primero está en vuelo (mig 249).';
