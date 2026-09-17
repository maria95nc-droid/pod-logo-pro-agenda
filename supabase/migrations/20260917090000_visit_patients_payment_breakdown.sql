-- Pagos fraccionados: un mismo cobro puede repartirse entre varias formas de
-- pago (p. ej. parte en efectivo y parte en Bizum/transferencia).
--
-- Formato de la columna:
--   [{"method":"Efectivo","amount":20},{"method":"Bizum","amount":15}]
--
-- NULL = cobro en una sola forma de pago (la habitual del centro), que es el
-- caso mayoritario; no se guarda desglose para no ensuciar los datos.
--
-- No se crean políticas nuevas: `visit_patients` ya tiene RLS activo y sus
-- cuatro políticas (`vp_select_via_visit`, `vp_insert_via_visit`,
-- `vp_update_via_visit`, `vp_delete_via_visit`) cubren la tabla entera,
-- incluidas las columnas añadidas después.
ALTER TABLE public.visit_patients
  ADD COLUMN IF NOT EXISTS payment_breakdown jsonb;

COMMENT ON COLUMN public.visit_patients.payment_breakdown IS
  'Desglose del cobro por forma de pago: [{"method":"Efectivo","amount":20},{"method":"Bizum","amount":15}]. NULL cuando se cobró con una sola forma de pago.';
