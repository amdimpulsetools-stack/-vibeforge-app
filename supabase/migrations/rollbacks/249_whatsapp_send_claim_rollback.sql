-- Rollback 249: vuelve al CHECK anterior y quita los índices.
-- Las reservas vivas ('sending') se marcan como fallidas antes de restaurar
-- el CHECK, que no admite ese estado.

update whatsapp_message_logs
   set status = 'failed',
       error_message = coalesce(error_message, 'reserva de envío revertida (rollback 249)')
 where status = 'sending';

drop index if exists whatsapp_message_logs_inflight_uniq;
drop index if exists whatsapp_message_logs_appt_tpl_idx;

alter table whatsapp_message_logs
  drop constraint if exists whatsapp_message_logs_status_check;

alter table whatsapp_message_logs
  add constraint whatsapp_message_logs_status_check
  check (status = any (array['sent', 'delivered', 'read', 'failed']));
