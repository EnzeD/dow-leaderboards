-- Drop unused bulky columns from match tables to reduce storage.
ALTER TABLE public.matches
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS observer_total,
  DROP COLUMN IF EXISTS options_blob,
  DROP COLUMN IF EXISTS slot_info_blob;

ALTER TABLE public.match_participants
  DROP COLUMN IF EXISTS statgroup_id,
  DROP COLUMN IF EXISTS outcome_raw,
  DROP COLUMN IF EXISTS wins,
  DROP COLUMN IF EXISTS losses,
  DROP COLUMN IF EXISTS streak,
  DROP COLUMN IF EXISTS arbitration,
  DROP COLUMN IF EXISTS report_type;
