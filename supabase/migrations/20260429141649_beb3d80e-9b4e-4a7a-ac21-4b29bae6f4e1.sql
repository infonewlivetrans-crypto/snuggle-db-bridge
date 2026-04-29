-- Привязка резервов к заявке на транспорт
ALTER TABLE public.stock_reservations
  ADD COLUMN IF NOT EXISTS transport_request_id UUID,
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_reserv_tr_request
  ON public.stock_reservations (transport_request_id)
  WHERE transport_request_id IS NOT NULL;

-- Расширяем допустимые типы движений: добавляем reserve, reservation_consume, shipment
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'inbound','outbound','adjustment','reservation_release',
    'transfer','writeoff','return',
    'reserve','reservation_consume','shipment'
  ]));

-- Поле для привязки движения к конкретной заявке на транспорт
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS ref_transport_request_id UUID;

CREATE INDEX IF NOT EXISTS idx_stock_mov_tr_request
  ON public.stock_movements (ref_transport_request_id)
  WHERE ref_transport_request_id IS NOT NULL;