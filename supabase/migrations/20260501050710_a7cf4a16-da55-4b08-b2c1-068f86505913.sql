-- Таблица задач и доработок (после пилотного запуска)
CREATE TABLE public.pilot_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  -- что/где/как воспроизвести
  what_broke text,
  where_broke text,
  how_to_reproduce text,
  -- контекст
  source text NOT NULL DEFAULT 'manual', -- 'feedback' | 'manual'
  feedback_id uuid,
  reporter_user_id uuid,
  reporter_name text,
  reporter_role text,
  route_label text,
  route_id uuid,
  -- классификация
  priority text NOT NULL DEFAULT 'important', -- 'critical' | 'important' | 'later'
  status text NOT NULL DEFAULT 'new',         -- 'new' | 'in_progress' | 'review' | 'done'
  assignee text,                              -- 'admin' | 'developer' | свободный текст
  -- даты
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX idx_pilot_tasks_status ON public.pilot_tasks(status);
CREATE INDEX idx_pilot_tasks_priority ON public.pilot_tasks(priority);
CREATE INDEX idx_pilot_tasks_created_at ON public.pilot_tasks(created_at DESC);
CREATE UNIQUE INDEX idx_pilot_tasks_feedback ON public.pilot_tasks(feedback_id) WHERE feedback_id IS NOT NULL;

-- Валидация значений (через триггер, не CHECK)
CREATE OR REPLACE FUNCTION public.pilot_tasks_validate()
RETURNS trigger AS $$
BEGIN
  IF NEW.priority NOT IN ('critical','important','later') THEN
    RAISE EXCEPTION 'invalid priority: %', NEW.priority;
  END IF;
  IF NEW.status NOT IN ('new','in_progress','review','done') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  NEW.updated_at := now();
  IF NEW.status = 'done' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_pilot_tasks_validate
BEFORE INSERT OR UPDATE ON public.pilot_tasks
FOR EACH ROW EXECUTE FUNCTION public.pilot_tasks_validate();

ALTER TABLE public.pilot_tasks ENABLE ROW LEVEL SECURITY;

-- Только админ/руководитель видят и управляют
CREATE POLICY pilot_tasks_select_admin ON public.pilot_tasks FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role));

CREATE POLICY pilot_tasks_insert_admin ON public.pilot_tasks FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role));

CREATE POLICY pilot_tasks_update_admin ON public.pilot_tasks FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role));

CREATE POLICY pilot_tasks_delete_admin ON public.pilot_tasks FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Комментарии по задачам
CREATE TABLE public.pilot_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.pilot_tasks(id) ON DELETE CASCADE,
  author_user_id uuid,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pilot_task_comments_task ON public.pilot_task_comments(task_id, created_at);

ALTER TABLE public.pilot_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY pilot_task_comments_select_admin ON public.pilot_task_comments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role));
CREATE POLICY pilot_task_comments_insert_admin ON public.pilot_task_comments FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role));
CREATE POLICY pilot_task_comments_delete_admin ON public.pilot_task_comments FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Автосоздание задачи из обратной связи: критические + любые с заполненным "broken"
CREATE OR REPLACE FUNCTION public.feedback_to_task()
RETURNS trigger AS $$
DECLARE
  v_priority text;
  v_title text;
  v_descr text;
BEGIN
  IF NEW.severity = 'critical' OR (NEW.broken IS NOT NULL AND length(btrim(NEW.broken)) > 0) THEN
    v_priority := CASE WHEN NEW.severity = 'critical' THEN 'critical'
                       WHEN NEW.severity = 'suggestion' THEN 'later'
                       ELSE 'important' END;
    v_title := COALESCE(
      NULLIF(btrim(left(COALESCE(NEW.broken, NEW.bad, NEW.unclear, NEW.comment, ''), 120)), ''),
      'Отзыв: ' || COALESCE(NEW.role, 'пользователь')
    );
    v_descr := concat_ws(E'\n',
      CASE WHEN NEW.broken   IS NOT NULL THEN 'Что ломается: '   || NEW.broken   END,
      CASE WHEN NEW.bad      IS NOT NULL THEN 'Что неудобно: '   || NEW.bad      END,
      CASE WHEN NEW.unclear  IS NOT NULL THEN 'Что непонятно: '  || NEW.unclear  END,
      CASE WHEN NEW.needed   IS NOT NULL THEN 'Что добавить: '   || NEW.needed   END,
      CASE WHEN NEW.comment  IS NOT NULL THEN 'Комментарий: '    || NEW.comment  END
    );

    INSERT INTO public.pilot_tasks (
      title, description, what_broke, where_broke, how_to_reproduce,
      source, feedback_id, reporter_user_id, reporter_name, reporter_role,
      route_label, route_id, priority, status, assignee
    ) VALUES (
      v_title, v_descr, NEW.broken, NEW.route_label, NEW.unclear,
      'feedback', NEW.id, NEW.user_id, NEW.user_name, NEW.role,
      NEW.route_label, NEW.route_id, v_priority, 'new', 'admin'
    )
    ON CONFLICT (feedback_id) WHERE feedback_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_feedback_to_task
AFTER INSERT ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.feedback_to_task();