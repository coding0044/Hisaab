ALTER TABLE public.profiles ADD COLUMN whatsapp_phone text;
ALTER TABLE public.profiles ADD COLUMN whatsapp_opted_in_at timestamptz;

UPDATE public.profiles
SET whatsapp_phone = CASE lower(email)
  WHEN 'faraz.maju@gmail.com' THEN '+923332853138'
  WHEN 'mirhassan@gmail.com' THEN '+923443579010'
END
WHERE lower(email) IN ('faraz.maju@gmail.com', 'mirhassan@gmail.com');

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_whatsapp_phone_format
  CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+923[0-9]{9}$');

GRANT UPDATE (whatsapp_phone, whatsapp_opted_in_at) ON public.profiles TO authenticated;

CREATE POLICY "Members update own WhatsApp number" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND public.is_member(auth.uid()))
  WITH CHECK (id = auth.uid() AND public.is_member(auth.uid()));

CREATE TABLE public.whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repayment_id uuid NOT NULL UNIQUE REFERENCES public.repayments(id) ON DELETE CASCADE,
  recipient_phone text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','accepted','failed','not_configured','unknown')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  current_attempt_id uuid,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.whatsapp_notifications(id) ON DELETE CASCADE,
  outcome text NOT NULL DEFAULT 'sending'
    CHECK (outcome IN ('sending','accepted','failed','not_configured','unknown')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.whatsapp_notifications
  ADD CONSTRAINT whatsapp_notifications_current_attempt_fkey
  FOREIGN KEY (current_attempt_id)
  REFERENCES public.whatsapp_notification_attempts(id);

CREATE INDEX whatsapp_notification_attempts_notification_idx
  ON public.whatsapp_notification_attempts(notification_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recipient_phone text;
BEGIN
  SELECT whatsapp_phone INTO _recipient_phone
  FROM public.profiles
  WHERE id = NEW.payee;

  INSERT INTO public.whatsapp_notifications(repayment_id, recipient_phone, status)
  VALUES (NEW.id, _recipient_phone, 'pending')
  ON CONFLICT (repayment_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_whatsapp_notification_after_repayment
  AFTER INSERT ON public.repayments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_notification();

ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notification_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.whatsapp_notifications, public.whatsapp_notification_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_notification(
  _repayment_id uuid,
  _recipient_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _notification public.whatsapp_notifications;
  _attempt_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.repayments WHERE id = _repayment_id) THEN
    RAISE EXCEPTION 'Repayment not found';
  END IF;

  INSERT INTO public.whatsapp_notifications(repayment_id, recipient_phone)
  VALUES (_repayment_id, _recipient_phone)
  ON CONFLICT (repayment_id) DO NOTHING;

  SELECT * INTO _notification
  FROM public.whatsapp_notifications
  WHERE repayment_id = _repayment_id
  FOR UPDATE;

  IF _notification.attempt_count > 0
    AND _notification.status NOT IN ('failed', 'not_configured') THEN
    RETURN jsonb_build_object('claimed', false, 'status', _notification.status);
  END IF;

  UPDATE public.whatsapp_notifications
  SET status = 'sending',
      recipient_phone = _recipient_phone,
      attempt_count = attempt_count + 1,
      last_error = NULL,
      updated_at = now()
  WHERE id = _notification.id
  RETURNING * INTO _notification;

  INSERT INTO public.whatsapp_notification_attempts(notification_id)
  VALUES (_notification.id)
  RETURNING id INTO _attempt_id;

  UPDATE public.whatsapp_notifications
  SET current_attempt_id = _attempt_id
  WHERE id = _notification.id;

  RETURN jsonb_build_object(
    'claimed', true,
    'notification_id', _notification.id,
    'attempt_id', _attempt_id,
    'attempt_count', _notification.attempt_count,
    'status', 'sending'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_notification(
  _notification_id uuid,
  _attempt_id uuid,
  _status text,
  _error text DEFAULT NULL,
  _provider_message_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('accepted', 'failed', 'not_configured', 'unknown') THEN
    RAISE EXCEPTION 'Invalid notification status';
  END IF;

  UPDATE public.whatsapp_notification_attempts
  SET outcome = _status,
      error = NULLIF(left(_error, 2000), ''),
      provider_message_id = NULLIF(_provider_message_id, ''),
      finished_at = now()
  WHERE id = _attempt_id AND notification_id = _notification_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification attempt not found'; END IF;

  UPDATE public.whatsapp_notifications
  SET status = _status,
      last_error = NULLIF(left(_error, 2000), ''),
      provider_message_id = NULLIF(_provider_message_id, ''),
      updated_at = now()
  WHERE id = _notification_id AND current_attempt_id = _attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_whatsapp_invocation_failure(
  _repayment_id uuid,
  _error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _notification_id uuid;
BEGIN
  IF NOT public.is_member(auth.uid()) OR NOT EXISTS (
    SELECT 1 FROM public.repayments
    WHERE id = _repayment_id AND payer = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.whatsapp_notifications
  SET status = 'unknown',
      last_error = left(_error, 2000),
      updated_at = now()
  WHERE repayment_id = _repayment_id AND status = 'pending'
  RETURNING id INTO _notification_id;

  IF _notification_id IS NOT NULL THEN
    INSERT INTO public.whatsapp_notification_attempts(
      notification_id, outcome, error, finished_at
    )
    VALUES (_notification_id, 'unknown', left(_error, 2000), now());
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_notification, public.complete_whatsapp_notification
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_notification, public.complete_whatsapp_notification
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_whatsapp_invocation_failure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_invocation_failure TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
NOTIFY pgrst, 'reload schema';
