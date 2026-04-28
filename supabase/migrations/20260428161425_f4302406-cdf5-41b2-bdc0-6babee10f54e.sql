-- ENUM для уровня риска
DO $$ BEGIN
  CREATE TYPE public.eta_risk_level AS ENUM ('on_time','tight','late','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- routes: параметры расчёта ETA
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS avg_speed_kmh NUMERIC NOT NULL DEFAULT 35,
  ADD COLUMN IF NOT EXISTS default_service_minutes INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS total_duration_minutes INTEGER NOT NULL DEFAULT 0;

-- route_points: ETA-поля
ALTER TABLE public.route_points
  ADD COLUMN IF NOT EXISTS leg_distance_km NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS client_window_from TIME,
  ADD COLUMN IF NOT EXISTS client_window_to TIME,
  ADD COLUMN IF NOT EXISTS eta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_window_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_window_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_risk public.eta_risk_level NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS eta_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Функция расчёта ETA
CREATE OR REPLACE FUNCTION public.recalc_route_etas(p_route_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route public.routes;
  v_start TIMESTAMPTZ;
  v_cursor TIMESTAMPTZ;
  v_speed NUMERIC;
  v_default_service INTEGER;
  r RECORD;
  v_travel_min INTEGER;
  v_service_min INTEGER;
  v_arrival TIMESTAMPTZ;
  v_window_from TIMESTAMPTZ;
  v_window_to TIMESTAMPTZ;
  v_risk public.eta_risk_level;
  v_reasons JSONB;
  v_client_from TIMESTAMPTZ;
  v_client_to TIMESTAMPTZ;
  v_uncertainty INTEGER;
  v_total INTEGER := 0;
  v_idx INTEGER := 0;
BEGIN
  SELECT * INTO v_route FROM public.routes WHERE id = p_route_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_speed := COALESCE(NULLIF(v_route.avg_speed_kmh, 0), 35);
  v_default_service := COALESCE(v_route.default_service_minutes, 20);

  -- Старт: planned_departure_at, иначе route_date 09:00
  v_start := COALESCE(
    v_route.planned_departure_at,
    (v_route.route_date::timestamp + INTERVAL '9 hours') AT TIME ZONE 'UTC'
  );
  v_cursor := v_start;

  FOR r IN
    SELECT rp.id, rp.point_number, rp.leg_distance_km, rp.service_minutes,
           rp.client_window_from, rp.client_window_to
    FROM public.route_points rp
    WHERE rp.route_id = p_route_id
    ORDER BY rp.point_number ASC, rp.created_at ASC
  LOOP
    v_idx := v_idx + 1;
    v_reasons := '[]'::jsonb;

    -- Время в пути (мин). Для первой точки тоже считаем (выезд → 1-я точка).
    v_travel_min := CEIL(COALESCE(r.leg_distance_km, 0) / v_speed * 60.0)::INT;
    v_service_min := COALESCE(r.service_minutes, v_default_service);

    v_arrival := v_cursor + make_interval(mins => v_travel_min);

    -- Окно клиента: применяем к дате прибытия
    IF r.client_window_from IS NOT NULL THEN
      v_client_from := (v_arrival::date + r.client_window_from) AT TIME ZONE 'UTC';
    ELSE v_client_from := NULL; END IF;
    IF r.client_window_to IS NOT NULL THEN
      v_client_to := (v_arrival::date + r.client_window_to) AT TIME ZONE 'UTC';
    ELSE v_client_to := NULL; END IF;

    -- Если приехали раньше окна — ждём до начала окна (это становится фактическим ETA)
    IF v_client_from IS NOT NULL AND v_arrival < v_client_from THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'code','wait_window',
        'text','Прибытие раньше окна клиента — ожидание до ' || to_char(v_client_from AT TIME ZONE 'UTC','HH24:MI')
      ));
      v_arrival := v_client_from;
    END IF;

    -- Неопределённость диапазона: 15% от пути + 10 мин на загрузку/трафик, мин 10
    v_uncertainty := GREATEST(10, CEIL(v_travel_min * 0.15)::INT + 10 + (v_idx * 2));
    v_window_from := v_arrival - make_interval(mins => v_uncertainty);
    v_window_to   := v_arrival + make_interval(mins => v_uncertainty);

    -- Оценка риска
    v_risk := 'on_time';
    IF v_client_to IS NOT NULL THEN
      IF v_arrival > v_client_to THEN
        v_risk := 'late';
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
          'code','after_window',
          'text','Прибытие позже окна клиента (до ' || to_char(v_client_to AT TIME ZONE 'UTC','HH24:MI') || ')'
        ));
      ELSIF v_window_to > v_client_to THEN
        v_risk := 'tight';
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
          'code','window_tight',
          'text','Верхняя граница ETA выходит за окно клиента'
        ));
      END IF;
    END IF;

    IF v_travel_min > 90 THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'code','long_leg',
        'text','Длинный перегон: ' || v_travel_min || ' мин (' || COALESCE(r.leg_distance_km,0) || ' км)'
      ));
      IF v_risk = 'on_time' THEN v_risk := 'tight'; END IF;
    END IF;

    IF v_idx >= 8 AND v_risk = 'on_time' THEN
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'code','accumulated',
        'text','Накопленная задержка по длинному маршруту'
      ));
      v_risk := 'tight';
    END IF;

    UPDATE public.route_points SET
      travel_minutes = v_travel_min,
      eta_at = v_arrival,
      eta_window_from = v_window_from,
      eta_window_to = v_window_to,
      eta_risk = v_risk,
      eta_reasons = v_reasons
    WHERE id = r.id;

    -- Сдвигаем курсор на обслуживание
    v_cursor := v_arrival + make_interval(mins => v_service_min);
    v_total := v_total + v_travel_min + v_service_min;
  END LOOP;

  UPDATE public.routes
     SET total_duration_minutes = v_total,
         updated_at = now()
   WHERE id = p_route_id;
END $$;

-- Триггер на route_points (вставка/удаление/перестановка/поля ETA)
CREATE OR REPLACE FUNCTION public.trg_route_points_recalc_eta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_route_etas(OLD.route_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalc_route_etas(NEW.route_id);
  IF TG_OP = 'UPDATE' AND NEW.route_id IS DISTINCT FROM OLD.route_id THEN
    PERFORM public.recalc_route_etas(OLD.route_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS route_points_recalc_eta ON public.route_points;
CREATE TRIGGER route_points_recalc_eta
AFTER INSERT OR DELETE OR UPDATE OF point_number, leg_distance_km, service_minutes, client_window_from, client_window_to, route_id
ON public.route_points
FOR EACH ROW EXECUTE FUNCTION public.trg_route_points_recalc_eta();

-- Триггер на routes (изменение скорости / выезда / даты)
CREATE OR REPLACE FUNCTION public.trg_routes_recalc_eta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_route_etas(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS routes_recalc_eta ON public.routes;
CREATE TRIGGER routes_recalc_eta
AFTER UPDATE OF planned_departure_at, route_date, avg_speed_kmh, default_service_minutes
ON public.routes
FOR EACH ROW
WHEN (
  NEW.planned_departure_at IS DISTINCT FROM OLD.planned_departure_at
  OR NEW.route_date IS DISTINCT FROM OLD.route_date
  OR NEW.avg_speed_kmh IS DISTINCT FROM OLD.avg_speed_kmh
  OR NEW.default_service_minutes IS DISTINCT FROM OLD.default_service_minutes
)
EXECUTE FUNCTION public.trg_routes_recalc_eta();