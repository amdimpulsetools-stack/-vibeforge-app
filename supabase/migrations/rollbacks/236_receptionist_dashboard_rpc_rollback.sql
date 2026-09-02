-- Rollback de la mig 236: elimina el RPC del dashboard de recepcionista.
-- La función es nueva en la 236 (no reemplazó a ninguna), así que el
-- rollback es un DROP limpio. El call site (app/(dashboard)/dashboard/
-- page.tsx, rama receptionist) tolera el fallo del RPC: initialData llega
-- null y el componente pinta empty-states.

DROP FUNCTION IF EXISTS get_receptionist_dashboard(UUID, DATE);
