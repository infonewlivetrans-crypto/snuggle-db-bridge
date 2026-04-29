CREATE TABLE public.system_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  role TEXT NOT NULL DEFAULT 'manager',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'new',
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system_issues" ON public.system_issues FOR SELECT USING (true);
CREATE POLICY "Anyone can insert system_issues" ON public.system_issues FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update system_issues" ON public.system_issues FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete system_issues" ON public.system_issues FOR DELETE USING (true);

CREATE TRIGGER update_system_issues_updated_at
BEFORE UPDATE ON public.system_issues
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();