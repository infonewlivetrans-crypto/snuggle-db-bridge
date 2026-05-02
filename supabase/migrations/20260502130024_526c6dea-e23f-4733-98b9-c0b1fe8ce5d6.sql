-- Полные строки в payload (нужно для корректной обработки UPDATE/DELETE)
ALTER TABLE public.delivery_routes REPLICA IDENTITY FULL;
ALTER TABLE public.route_points REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Добавляем в публикацию Realtime (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_routes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.route_points;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;