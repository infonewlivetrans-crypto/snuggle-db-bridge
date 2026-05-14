-- Enum для статусов заказа
CREATE TYPE public.order_status AS ENUM ('new', 'in_progress', 'delivering', 'completed', 'cancelled');
CREATE TYPE public.payment_type AS ENUM ('cash', 'card', 'online', 'qr');

-- Таблица заказов
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  status public.order_status NOT NULL DEFAULT 'new',
  delivery_address TEXT NOT NULL,
  payment_type public.payment_type NOT NULL DEFAULT 'cash',
  requires_qr BOOLEAN NOT NULL DEFAULT false,
  comment TEXT,
  cash_received BOOLEAN NOT NULL DEFAULT false,
  qr_received BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Политики: открытый доступ для интерфейса менеджера (без авторизации)
CREATE POLICY "Anyone can view orders"
  ON public.orders FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update orders"
  ON public.orders FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete orders"
  ON public.orders FOR DELETE
  USING (true);

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Индексы
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

-- Тестовые данные
INSERT INTO public.orders (order_number, status, delivery_address, payment_type, requires_qr, comment) VALUES
  ('RT-1001', 'new', 'г. Москва, ул. Тверская, 12, кв. 45', 'cash', false, 'Позвонить за час до доставки'),
  ('RT-1002', 'in_progress', 'г. Москва, Ленинский пр-т, 78, кв. 12', 'card', true, 'Домофон не работает'),
  ('RT-1003', 'delivering', 'г. Москва, ул. Арбат, 24', 'qr', true, 'Офис на 3 этаже'),
  ('RT-1004', 'completed', 'г. Москва, Кутузовский пр-т, 30', 'online', false, NULL),
  ('RT-1005', 'new', 'г. Санкт-Петербург, Невский пр-т, 100', 'cash', false, 'Передать охраннику'),
  ('RT-1006', 'in_progress', 'г. Москва, ул. Покровка, 17', 'qr', true, 'Срочно!'),
  ('RT-1007', 'cancelled', 'г. Москва, Профсоюзная, 56', 'cash', false, 'Клиент отменил'),
  ('RT-1008', 'new', 'г. Екатеринбург, ул. Ленина, 25', 'card', false, NULL);