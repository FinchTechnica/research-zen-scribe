
-- Subtasks
CREATE TABLE public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subtasks TO authenticated;
GRANT ALL ON public.subtasks TO service_role;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subtasks" ON public.subtasks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX subtasks_task_idx ON public.subtasks(task_id);

-- Archive flag + index
ALTER TABLE public.tasks ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE INDEX tasks_archived_idx ON public.tasks(user_id, archived);

-- Notification prefs on profile
ALTER TABLE public.profiles
  ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT
    '{"browser": true, "email": false, "deadline_24h": true, "deadline_overdue": true}'::jsonb;

-- Feedback (Contact submissions)
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  submission_number integer NOT NULL,
  kind text NOT NULL DEFAULT 'feedback',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feedback" ON public.feedback FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX feedback_user_num_idx ON public.feedback(user_id, submission_number);

-- Per-user auto-increment trigger for submission_number
CREATE OR REPLACE FUNCTION public.feedback_set_submission_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.submission_number IS NULL OR NEW.submission_number = 0 THEN
    SELECT COALESCE(MAX(submission_number), 0) + 1
      INTO NEW.submission_number
      FROM public.feedback
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_submission_number
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_set_submission_number();

-- Generic updated_at trigger if not already present
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER subtasks_updated_at BEFORE UPDATE ON public.subtasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
