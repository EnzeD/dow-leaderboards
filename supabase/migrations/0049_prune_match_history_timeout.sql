-- Ensure prune runs without statement timeouts.
CREATE OR REPLACE FUNCTION public.prune_match_history(
  p_keep_days integer DEFAULT 7
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  keep_days integer := greatest(coalesce(p_keep_days, 7), 1);
BEGIN
  PERFORM set_config('statement_timeout', '0', true);

  DELETE FROM public.matches
  WHERE completed_at IS NOT NULL
    AND completed_at < (now() - make_interval(days => keep_days));
END;
$$;
