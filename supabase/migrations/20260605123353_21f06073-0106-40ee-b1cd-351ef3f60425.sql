
-- 1) Drop FKs that reference production tables
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_tasks_carrier_id_fkey;
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_tasks_driver_id_fkey;
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_tasks_vehicle_id_fkey;
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_tasks_freight_id_fkey;
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_tasks_deal_id_fkey;

-- 2) Drop legacy production-ref columns (table is empty, безопасно)
ALTER TABLE public.dispatcher_tasks DROP COLUMN IF EXISTS carrier_id;
ALTER TABLE public.dispatcher_tasks DROP COLUMN IF EXISTS driver_id;
ALTER TABLE public.dispatcher_tasks DROP COLUMN IF EXISTS vehicle_id;
ALTER TABLE public.dispatcher_tasks DROP COLUMN IF EXISTS freight_id;
ALTER TABLE public.dispatcher_tasks DROP COLUMN IF EXISTS deal_id;

-- 3) Rename columns to spec
ALTER TABLE public.dispatcher_tasks RENAME COLUMN type TO task_type;
ALTER TABLE public.dispatcher_tasks RENAME COLUMN status TO task_status;
ALTER TABLE public.dispatcher_tasks RENAME COLUMN comment TO description;

-- 4) Add new columns
ALTER TABLE public.dispatcher_tasks
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Задача',
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS related_entity_type text,
  ADD COLUMN IF NOT EXISTS related_entity_id uuid,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatcher_carrier_ext_id uuid,
  ADD COLUMN IF NOT EXISTS dispatcher_driver_ext_id uuid,
  ADD COLUMN IF NOT EXISTS dispatcher_vehicle_ext_id uuid,
  ADD COLUMN IF NOT EXISTS dispatcher_freight_id uuid,
  ADD COLUMN IF NOT EXISTS dispatcher_deal_id uuid;

-- 5) Drop default for title (was for safe ADD COLUMN), but allow inserts to provide value
ALTER TABLE public.dispatcher_tasks ALTER COLUMN title DROP DEFAULT;

-- 6) Update default for task_status from 'new' to 'open' (per spec)
ALTER TABLE public.dispatcher_tasks ALTER COLUMN task_status SET DEFAULT 'open';
ALTER TABLE public.dispatcher_tasks ALTER COLUMN priority SET DEFAULT 'normal';

-- 7) Update CHECK constraints
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_task_type_chk;
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_task_status_chk;
ALTER TABLE public.dispatcher_tasks DROP CONSTRAINT IF EXISTS dispatcher_task_priority_chk;

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_task_type_chk CHECK (task_type IN (
    'check_documents','find_freight','check_freight_matches','create_deal',
    'call_driver','call_carrier','check_loading','check_unloading',
    'check_customer_payment','remind_commission','overdue_commission',
    'close_deal','custom'
  ));

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_task_status_chk CHECK (task_status IN (
    'open','in_progress','done','cancelled'
  ));

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_task_priority_chk CHECK (priority IN (
    'low','normal','high','urgent'
  ));

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_task_related_entity_chk CHECK (
    related_entity_type IS NULL OR related_entity_type IN (
      'carrier','driver','vehicle','freight','deal','commission','none'
    )
  );

-- 8) FKs to ext tables (ON DELETE SET NULL)
ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_tasks_carrier_ext_fk
  FOREIGN KEY (dispatcher_carrier_ext_id) REFERENCES public.dispatcher_carrier_ext(id) ON DELETE SET NULL;

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_tasks_driver_ext_fk
  FOREIGN KEY (dispatcher_driver_ext_id) REFERENCES public.dispatcher_driver_ext(id) ON DELETE SET NULL;

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_tasks_vehicle_ext_fk
  FOREIGN KEY (dispatcher_vehicle_ext_id) REFERENCES public.dispatcher_vehicle_ext(id) ON DELETE SET NULL;

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_tasks_freight_fk
  FOREIGN KEY (dispatcher_freight_id) REFERENCES public.dispatcher_freights(id) ON DELETE SET NULL;

ALTER TABLE public.dispatcher_tasks
  ADD CONSTRAINT dispatcher_tasks_deal_fk
  FOREIGN KEY (dispatcher_deal_id) REFERENCES public.dispatcher_deals(id) ON DELETE SET NULL;

-- 9) Indexes for fast lookups
CREATE INDEX IF NOT EXISTS dispatcher_tasks_task_status_idx ON public.dispatcher_tasks(task_status);
CREATE INDEX IF NOT EXISTS dispatcher_tasks_task_type_idx ON public.dispatcher_tasks(task_type);
CREATE INDEX IF NOT EXISTS dispatcher_tasks_related_idx ON public.dispatcher_tasks(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS dispatcher_tasks_due_at_idx ON public.dispatcher_tasks(due_at);
