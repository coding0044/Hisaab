
-- Allowed members
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.allowed_display_name(_email text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(_email)
    WHEN 'faraz.maju@gmail.com' THEN 'Faraz Ahmed'
    WHEN 'mirhassan@gmail.com' THEN 'Mir Hassan'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.is_member(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid)
$$;

CREATE POLICY "Members read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text := public.allowed_display_name(NEW.email);
BEGIN
  IF _name IS NOT NULL THEN
    INSERT INTO public.profiles(id, email, display_name) VALUES (NEW.id, lower(NEW.email), _name)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Transactions (debts)
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  paid_by uuid NOT NULL REFERENCES public.profiles(id),
  owed_by uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  txn_date date NOT NULL,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  category text NOT NULL CHECK (category IN ('food','transport','shopping','bills','rent','entertainment','travel','health','loan','other')),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  client_request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_by <> owed_by)
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read transactions" ON public.transactions FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

-- Repayments
CREATE TABLE public.repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  payer uuid NOT NULL REFERENCES public.profiles(id),
  payee uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','bank_transfer')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  reviewed_at timestamptz,
  client_request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.repayments(transaction_id);
GRANT SELECT ON public.repayments TO authenticated;
GRANT ALL ON public.repayments TO service_role;
ALTER TABLE public.repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read repayments" ON public.repayments FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

-- Payment proofs / receipts
CREATE TABLE public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id),
  repayment_id uuid REFERENCES public.repayments(id),
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((transaction_id IS NOT NULL) <> (repayment_id IS NOT NULL))
);
GRANT SELECT ON public.payment_proofs TO authenticated;
GRANT ALL ON public.payment_proofs TO service_role;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read proofs" ON public.payment_proofs FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  title text NOT NULL,
  body text NOT NULL,
  transaction_id uuid REFERENCES public.transactions(id),
  repayment_id uuid REFERENCES public.repayments(id),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notifications(user_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_member(auth.uid()));

-- Audit logs
CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));

-- Summary view (balances computed from real rows)
CREATE VIEW public.transaction_summary WITH (security_invoker = true) AS
SELECT t.*,
  COALESCE((SELECT sum(r.amount) FROM public.repayments r WHERE r.transaction_id = t.id AND r.status='confirmed'),0)::numeric(14,2) AS repaid,
  COALESCE((SELECT sum(r.amount) FROM public.repayments r WHERE r.transaction_id = t.id AND r.status='pending'),0)::numeric(14,2) AS awaiting,
  (t.amount - COALESCE((SELECT sum(r.amount) FROM public.repayments r WHERE r.transaction_id = t.id AND r.status='confirmed'),0))::numeric(14,2) AS outstanding,
  CASE
    WHEN t.amount - COALESCE((SELECT sum(r.amount) FROM public.repayments r WHERE r.transaction_id = t.id AND r.status='confirmed'),0) <= 0 THEN 'settled'
    WHEN EXISTS (SELECT 1 FROM public.repayments r WHERE r.transaction_id = t.id AND r.status='pending') THEN 'awaiting_confirmation'
    WHEN EXISTS (SELECT 1 FROM public.repayments r WHERE r.transaction_id = t.id AND r.status='confirmed') THEN 'partially_paid'
    ELSE 'pending' END AS status
FROM public.transactions t;
GRANT SELECT ON public.transaction_summary TO authenticated;

-- RPC: create transaction
CREATE OR REPLACE FUNCTION public.create_transaction(
  _paid_by uuid, _owed_by uuid, _amount numeric, _txn_date date, _description text,
  _category text, _client_request_id uuid, _proof_path text DEFAULT NULL, _proof_name text DEFAULT NULL, _proof_mime text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _payer_name text;
BEGIN
  IF NOT public.is_member(_uid) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT id INTO _id FROM public.transactions WHERE client_request_id = _client_request_id;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF NOT public.is_member(_paid_by) OR NOT public.is_member(_owed_by) OR _paid_by = _owed_by THEN
    RAISE EXCEPTION 'Paid by and owed by must be the two different friends'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000000 OR round(_amount,2) <> _amount THEN
    RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _txn_date > current_date + 1 THEN RAISE EXCEPTION 'Date cannot be in the future'; END IF;
  IF _proof_path IS NOT NULL AND _proof_path NOT LIKE _uid::text || '/%' THEN RAISE EXCEPTION 'Invalid file'; END IF;
  INSERT INTO public.transactions(paid_by, owed_by, amount, txn_date, description, category, created_by, client_request_id)
  VALUES (_paid_by, _owed_by, _amount, _txn_date, btrim(_description), _category, _uid, _client_request_id)
  RETURNING id INTO _id;
  IF _proof_path IS NOT NULL THEN
    INSERT INTO public.payment_proofs(transaction_id, storage_path, file_name, mime_type, uploaded_by)
    VALUES (_id, _proof_path, _proof_name, _proof_mime, _uid);
  END IF;
  SELECT display_name INTO _payer_name FROM public.profiles WHERE id = _paid_by;
  INSERT INTO public.notifications(user_id, title, body, transaction_id)
  SELECT p.id, 'New expense recorded', _payer_name || ' paid Rs. ' || to_char(_amount,'FM999,999,999,990.00') || ' — ' || btrim(_description), _id
  FROM public.profiles p WHERE p.id <> _uid;
  INSERT INTO public.audit_logs(actor, action, entity, entity_id, details)
  VALUES (_uid, 'transaction.create', 'transaction', _id,
    jsonb_build_object('amount',_amount,'paid_by',_paid_by,'owed_by',_owed_by,'category',_category));
  RETURN _id;
END $$;

-- RPC: submit repayment
CREATE OR REPLACE FUNCTION public.submit_repayment(
  _transaction_id uuid, _amount numeric, _method text, _note text, _client_request_id uuid,
  _proof_path text DEFAULT NULL, _proof_name text DEFAULT NULL, _proof_mime text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _t public.transactions; _id uuid; _confirmed numeric; _pending numeric; _name text;
BEGIN
  IF NOT public.is_member(_uid) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT id INTO _id FROM public.repayments WHERE client_request_id = _client_request_id;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  SELECT * INTO _t FROM public.transactions WHERE id = _transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF _t.owed_by <> _uid THEN RAISE EXCEPTION 'Only the person who owes this debt can return money'; END IF;
  IF _method NOT IN ('cash','bank_transfer') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR round(_amount,2) <> _amount THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  SELECT COALESCE(sum(amount) FILTER (WHERE status='confirmed'),0), COALESCE(sum(amount) FILTER (WHERE status='pending'),0)
    INTO _confirmed, _pending FROM public.repayments WHERE transaction_id = _t.id;
  IF _amount > _t.amount - _confirmed - _pending THEN
    RAISE EXCEPTION 'Amount exceeds the remaining balance (Rs. %)', to_char(_t.amount - _confirmed - _pending,'FM999,999,999,990.00'); END IF;
  IF _proof_path IS NOT NULL AND _proof_path NOT LIKE _uid::text || '/%' THEN RAISE EXCEPTION 'Invalid file'; END IF;
  INSERT INTO public.repayments(transaction_id, payer, payee, amount, method, note, client_request_id)
  VALUES (_t.id, _uid, _t.paid_by, _amount, _method, NULLIF(btrim(_note),''), _client_request_id)
  RETURNING id INTO _id;
  IF _proof_path IS NOT NULL THEN
    INSERT INTO public.payment_proofs(repayment_id, storage_path, file_name, mime_type, uploaded_by)
    VALUES (_id, _proof_path, _proof_name, _proof_mime, _uid);
  END IF;
  SELECT display_name INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.notifications(user_id, title, body, transaction_id, repayment_id)
  VALUES (_t.paid_by, 'Repayment awaiting confirmation',
    _name || ' says they returned Rs. ' || to_char(_amount,'FM999,999,999,990.00') || ' by ' || replace(_method,'_',' ') || '. Please confirm or reject.', _t.id, _id);
  INSERT INTO public.audit_logs(actor, action, entity, entity_id, details)
  VALUES (_uid, 'repayment.submit', 'repayment', _id, jsonb_build_object('transaction_id',_t.id,'amount',_amount,'method',_method));
  RETURN _id;
END $$;

-- RPC: review repayment
CREATE OR REPLACE FUNCTION public.review_repayment(_repayment_id uuid, _decision text, _review_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _r public.repayments; _t public.transactions; _confirmed numeric; _name text;
BEGIN
  IF NOT public.is_member(_uid) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _decision NOT IN ('confirmed','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  SELECT * INTO _r FROM public.repayments WHERE id = _repayment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repayment not found'; END IF;
  IF _r.payee <> _uid THEN RAISE EXCEPTION 'Only the person receiving the money can review it'; END IF;
  IF _r.status <> 'pending' THEN RAISE EXCEPTION 'This repayment was already %', _r.status; END IF;
  SELECT * INTO _t FROM public.transactions WHERE id = _r.transaction_id FOR UPDATE;
  IF _decision = 'confirmed' THEN
    SELECT COALESCE(sum(amount),0) INTO _confirmed FROM public.repayments WHERE transaction_id = _t.id AND status='confirmed';
    IF _confirmed + _r.amount > _t.amount THEN RAISE EXCEPTION 'Confirming would exceed the original debt'; END IF;
  END IF;
  UPDATE public.repayments SET status = _decision, reviewed_at = now(), review_note = NULLIF(btrim(_review_note),'') WHERE id = _r.id;
  SELECT display_name INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.notifications(user_id, title, body, transaction_id, repayment_id)
  VALUES (_r.payer, CASE WHEN _decision='confirmed' THEN 'Repayment confirmed' ELSE 'Repayment rejected' END,
    _name || CASE WHEN _decision='confirmed' THEN ' confirmed receiving Rs. ' ELSE ' rejected your repayment of Rs. ' END
      || to_char(_r.amount,'FM999,999,999,990.00') || COALESCE(' — ' || NULLIF(btrim(_review_note),''), ''), _t.id, _r.id);
  INSERT INTO public.audit_logs(actor, action, entity, entity_id, details)
  VALUES (_uid, 'repayment.' || _decision, 'repayment', _r.id, jsonb_build_object('transaction_id',_t.id,'amount',_r.amount));
  RETURN _decision;
END $$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[] DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET is_read = true
  WHERE user_id = auth.uid() AND is_read = false AND (_ids IS NULL OR id = ANY(_ids));
$$;

REVOKE EXECUTE ON FUNCTION public.create_transaction, public.submit_repayment, public.review_repayment, public.mark_notifications_read FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_transaction, public.submit_repayment, public.review_repayment, public.mark_notifications_read TO authenticated;

-- Storage policies for private bucket "proofs"
CREATE POLICY "Members read proofs files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proofs' AND public.is_member(auth.uid()));
CREATE POLICY "Members upload own proofs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs' AND public.is_member(auth.uid()) AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions, public.repayments, public.notifications;
