-- 5.1: orders.client_id + clients.phone UNIQUE + backfill
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_client_id_idx ON public.orders(client_id);

-- Уникальность телефона клиента (проверено: 0 дубликатов).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_phone_unique'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_phone_unique UNIQUE (phone);
  END IF;
END$$;

-- Бэкфилл: только однозначные совпадения, новых клиентов не создаём.
WITH norm AS (
  SELECT id,
    NULLIF(regexp_replace(coalesce(contact_phone,''), '\D', '', 'g'), '') AS digits,
    LOWER(NULLIF(trim(coalesce(contact_name,'')), '')) AS lname
  FROM public.orders
  WHERE client_id IS NULL
),
by_phone AS (
  SELECT n.id AS order_id, c.id AS client_id
  FROM norm n
  JOIN public.clients c
    ON n.digits IS NOT NULL
   AND (
        regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = n.digits
     OR regexp_replace(coalesce(c.phone_alt, ''), '\D', '', 'g') = n.digits
   )
),
by_phone_unique AS (
  SELECT order_id, MIN(client_id::text)::uuid AS client_id
  FROM by_phone
  GROUP BY order_id
  HAVING COUNT(DISTINCT client_id) = 1
),
by_name AS (
  SELECT n.id AS order_id, c.id AS client_id
  FROM norm n
  JOIN public.clients c ON LOWER(c.name) = n.lname
  WHERE n.lname IS NOT NULL
    AND n.id NOT IN (SELECT order_id FROM by_phone_unique)
),
by_name_unique AS (
  SELECT order_id, MIN(client_id::text)::uuid AS client_id
  FROM by_name
  GROUP BY order_id
  HAVING COUNT(DISTINCT client_id) = 1
),
resolved AS (
  SELECT * FROM by_phone_unique
  UNION ALL
  SELECT * FROM by_name_unique
)
UPDATE public.orders o
SET client_id = r.client_id
FROM resolved r
WHERE o.id = r.order_id
  AND o.client_id IS NULL;