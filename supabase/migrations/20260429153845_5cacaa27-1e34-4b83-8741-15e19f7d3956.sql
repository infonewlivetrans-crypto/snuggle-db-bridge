CREATE TABLE IF NOT EXISTS public.supply_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  warehouse_id uuid,
  product_id uuid,
  transport_request_id uuid,
  supply_request_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.supply_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view supply_notification_log"
  ON public.supply_notification_log FOR SELECT USING (true);
CREATE POLICY "Anyone can insert supply_notification_log"
  ON public.supply_notification_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete supply_notification_log"
  ON public.supply_notification_log FOR DELETE USING (true);

-- Дедуп для низкого остатка: одно активное уведомление на (склад, товар)
CREATE UNIQUE INDEX IF NOT EXISTS uq_supply_notif_low_stock
  ON public.supply_notification_log(warehouse_id, product_id)
  WHERE event_type = 'low_stock';

-- Дедуп для нехватки под заявку: один раз на (заявка, товар)
CREATE UNIQUE INDEX IF NOT EXISTS uq_supply_notif_shortage
  ON public.supply_notification_log(transport_request_id, product_id)
  WHERE event_type = 'shortage';

-- Дедуп для уведомления о создании заявки на пополнение
CREATE UNIQUE INDEX IF NOT EXISTS uq_supply_notif_request_created
  ON public.supply_notification_log(supply_request_id)
  WHERE event_type = 'supply_request_created';