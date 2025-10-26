-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.api_responses (
  id bigint NOT NULL DEFAULT nextval('api_responses_id_seq'::regclass),
  endpoint text NOT NULL,
  request_hash text NOT NULL UNIQUE,
  status_code integer,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  duration_ms integer,
  payload jsonb NOT NULL,
  CONSTRAINT api_responses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_users (
  auth0_sub text NOT NULL,
  email text,
  email_verified boolean,
  stripe_customer_id text,
  stripe_subscription_id text,
  premium_expires_at timestamp with time zone,
  primary_profile_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stripe_subscription_status text,
  stripe_subscription_cancel_at_period_end boolean,
  CONSTRAINT app_users_pkey PRIMARY KEY (auth0_sub),
  CONSTRAINT app_users_primary_profile_id_fkey FOREIGN KEY (primary_profile_id) REFERENCES public.players(profile_id)
);
CREATE TABLE public.crawl_jobs (
  id bigint NOT NULL DEFAULT nextval('crawl_jobs_id_seq'::regclass),
  kind USER-DEFINED NOT NULL,
  payload jsonb NOT NULL,
  priority integer NOT NULL DEFAULT 10,
  run_after timestamp with time zone NOT NULL DEFAULT now(),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::crawl_job_status,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT crawl_jobs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.crawl_runs (
  job_id bigint NOT NULL,
  started_at timestamp with time zone NOT NULL,
  finished_at timestamp with time zone,
  success boolean NOT NULL DEFAULT false,
  request_count integer,
  error_message text,
  notes text,
  CONSTRAINT crawl_runs_pkey PRIMARY KEY (job_id, started_at),
  CONSTRAINT crawl_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.crawl_jobs(id)
);
CREATE TABLE public.leaderboard_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  mode text NOT NULL,
  payload jsonb NOT NULL,
  player_count integer,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT leaderboard_history_pkey PRIMARY KEY (id)
);
CREATE TABLE public.leaderboard_mappings (
  leaderboard_id integer NOT NULL,
  match_type_id integer NOT NULL,
  statgroup_type smallint NOT NULL,
  race_id smallint NOT NULL,
  CONSTRAINT leaderboard_mappings_pkey PRIMARY KEY (leaderboard_id, match_type_id, statgroup_type, race_id),
  CONSTRAINT leaderboard_mappings_leaderboard_id_fkey FOREIGN KEY (leaderboard_id) REFERENCES public.leaderboards(id),
  CONSTRAINT leaderboard_mappings_match_type_id_fkey FOREIGN KEY (match_type_id) REFERENCES public.match_types(id),
  CONSTRAINT leaderboard_mappings_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id)
);
CREATE TABLE public.leaderboard_rank_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  snapshot_id bigint NOT NULL,
  leaderboard_id integer NOT NULL,
  profile_id text NOT NULL,
  rank integer NOT NULL,
  rating integer,
  captured_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT leaderboard_rank_history_pkey PRIMARY KEY (id),
  CONSTRAINT leaderboard_rank_history_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.leaderboard_history(id)
);
CREATE TABLE public.leaderboard_snapshot_entries (
  snapshot_id uuid NOT NULL,
  rank integer NOT NULL,
  profile_id bigint NOT NULL,
  statgroup_id bigint,
  rating integer,
  wins integer,
  losses integer,
  streak integer,
  disputes integer,
  drops integer,
  rank_total integer,
  rank_level integer,
  region_rank integer,
  region_rank_total integer,
  highest_rank integer,
  highest_rank_level integer,
  highest_rating integer,
  winrate numeric,
  last_match_at timestamp with time zone,
  CONSTRAINT leaderboard_snapshot_entries_pkey PRIMARY KEY (snapshot_id, rank),
  CONSTRAINT leaderboard_snapshot_entries_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.leaderboard_snapshots(id),
  CONSTRAINT leaderboard_snapshot_entries_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.players(profile_id)
);
CREATE TABLE public.leaderboard_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  leaderboard_id integer NOT NULL,
  captured_on date NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'cron-daily'::text,
  total_players integer,
  CONSTRAINT leaderboard_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT leaderboard_snapshots_leaderboard_id_fkey FOREIGN KEY (leaderboard_id) REFERENCES public.leaderboards(id)
);
CREATE TABLE public.leaderboards (
  id integer NOT NULL,
  name text NOT NULL,
  display_name text,
  is_ranked boolean NOT NULL DEFAULT true,
  default_match_type_id integer,
  default_race_id smallint,
  default_statgroup_type smallint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leaderboards_pkey PRIMARY KEY (id),
  CONSTRAINT leaderboards_default_match_type_id_fkey FOREIGN KEY (default_match_type_id) REFERENCES public.match_types(id),
  CONSTRAINT leaderboards_default_race_id_fkey FOREIGN KEY (default_race_id) REFERENCES public.races(id)
);
CREATE TABLE public.match_participants (
  match_id bigint NOT NULL,
  profile_id bigint NOT NULL,
  team_id smallint,
  race_id smallint,
  statgroup_id bigint,
  alias_at_match text,
  outcome USER-DEFINED NOT NULL DEFAULT 'unknown'::match_outcome,
  outcome_raw smallint,
  wins integer,
  losses integer,
  streak integer,
  arbitration smallint,
  report_type smallint,
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  is_computer boolean NOT NULL DEFAULT false,
  CONSTRAINT match_participants_pkey PRIMARY KEY (match_id, profile_id),
  CONSTRAINT match_participants_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id),
  CONSTRAINT match_participants_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.players(profile_id),
  CONSTRAINT match_participants_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id)
);
CREATE TABLE public.match_report_results (
  match_id bigint NOT NULL,
  profile_id bigint NOT NULL,
  result_type smallint,
  team_id smallint,
  race_id smallint,
  xp_gained integer,
  counters jsonb,
  match_start_at timestamp with time zone,
  CONSTRAINT match_report_results_pkey PRIMARY KEY (match_id, profile_id),
  CONSTRAINT match_report_results_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id),
  CONSTRAINT match_report_results_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.players(profile_id),
  CONSTRAINT match_report_results_race_id_fkey FOREIGN KEY (race_id) REFERENCES public.races(id)
);
CREATE TABLE public.match_team_results (
  match_id bigint NOT NULL,
  team_id smallint NOT NULL,
  outcome USER-DEFINED NOT NULL DEFAULT 'unknown'::match_outcome,
  team_rating_avg numeric,
  team_rating_sigma numeric,
  CONSTRAINT match_team_results_pkey PRIMARY KEY (match_id, team_id),
  CONSTRAINT match_team_results_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(match_id)
);
CREATE TABLE public.match_types (
  id integer NOT NULL,
  label text NOT NULL,
  locstring_id integer,
  CONSTRAINT match_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.matches (
  match_id bigint NOT NULL,
  match_type_id integer NOT NULL,
  map_name text,
  description text,
  max_players smallint,
  creator_profile_id bigint,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_seconds integer,
  observer_total integer,
  crawled_at timestamp with time zone,
  source_alias text,
  options_blob text,
  slot_info_blob text,
  CONSTRAINT matches_pkey PRIMARY KEY (match_id),
  CONSTRAINT matches_match_type_id_fkey FOREIGN KEY (match_type_id) REFERENCES public.match_types(id)
);
CREATE TABLE public.player_alias_history (
  profile_id bigint NOT NULL,
  alias text NOT NULL,
  first_seen_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  CONSTRAINT player_alias_history_pkey PRIMARY KEY (profile_id, alias),
  CONSTRAINT player_alias_history_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.players(profile_id)
);
CREATE TABLE public.player_leaderboard_stats (
  profile_id bigint NOT NULL,
  leaderboard_id integer NOT NULL,
  rating integer,
  wins integer,
  losses integer,
  streak integer,
  rank integer,
  rank_total integer,
  rank_level integer,
  disputes integer,
  drops integer,
  region_rank integer,
  region_rank_total integer,
  last_match_at timestamp with time zone,
  peak_rank integer,
  peak_rank_level integer,
  peak_rating integer,
  snapshot_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_leaderboard_stats_pkey PRIMARY KEY (profile_id, leaderboard_id, snapshot_at),
  CONSTRAINT player_leaderboard_stats_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.players(profile_id),
  CONSTRAINT player_leaderboard_stats_leaderboard_id_fkey FOREIGN KEY (leaderboard_id) REFERENCES public.leaderboards(id)
);
CREATE TABLE public.players (
  profile_id bigint NOT NULL,
  current_alias text,
  country text,
  steam_id64 text UNIQUE,
  statgroup_id bigint,
  level integer,
  xp integer,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT players_pkey PRIMARY KEY (profile_id)
);
CREATE TABLE public.premium_feature_activations (
  profile_id bigint NOT NULL,
  activated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT premium_feature_activations_pkey PRIMARY KEY (profile_id),
  CONSTRAINT premium_feature_activations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.players(profile_id)
);
CREATE TABLE public.premium_interest_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  alias_submitted text NOT NULL,
  profile_id text,
  player_name text,
  survey_choice text CHECK (survey_choice IS NULL OR survey_choice = 'No'::text OR survey_choice ~ '^(Yes|Maybe)'::text OR survey_choice ~ '^\$?\d+(\.\d{1,2})?/month$'::text),
  email text,
  source text NOT NULL DEFAULT 'search_teaser'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT premium_interest_leads_pkey PRIMARY KEY (id)
);
CREATE TABLE public.premium_subscriptions (
  auth0_sub text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  cancel_at_period_end boolean,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  price_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT premium_subscriptions_pkey PRIMARY KEY (auth0_sub),
  CONSTRAINT premium_subscriptions_auth0_sub_fkey FOREIGN KEY (auth0_sub) REFERENCES public.app_users(auth0_sub) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE public.races (
  id smallint NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  faction_id smallint,
  CONSTRAINT races_pkey PRIMARY KEY (id)
);
CREATE TABLE public.replay_download_events (
  id bigint NOT NULL DEFAULT nextval('replay_download_events_id_seq'::regclass),
  path text NOT NULL,
  ip_hash text NOT NULL,
  downloaded_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT replay_download_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.replay_download_stats (
  path text NOT NULL,
  download_count bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT replay_download_stats_pkey PRIMARY KEY (path)
);
CREATE TABLE public.replay_metadata (
  path text NOT NULL,
  original_name text NOT NULL,
  replay_name text,
  map_name text,
  game_version text,
  match_duration_seconds integer,
  match_duration_label text,
  profiles jsonb,
  raw_metadata jsonb,
  submitted_name text,
  submitted_comment text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  uploader_ip_hash text,
  winner_team integer CHECK (winner_team IS NULL OR (winner_team = ANY (ARRAY[1, 2]))),
  id integer NOT NULL DEFAULT nextval('replay_metadata_id_seq'::regclass) UNIQUE,
  CONSTRAINT replay_metadata_pkey PRIMARY KEY (path)
);
CREATE TABLE public.replay_player_links (
  replay_path text NOT NULL,
  replay_player_alias text NOT NULL,
  profile_id bigint NOT NULL,
  match_confidence real NOT NULL DEFAULT 1.0,
  match_method text NOT NULL DEFAULT 'exact'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  rating integer,
  rank integer,
  leaderboard_id integer,
  CONSTRAINT replay_player_links_pkey PRIMARY KEY (replay_path, replay_player_alias),
  CONSTRAINT fk_replay_player_links_replay_path FOREIGN KEY (replay_path) REFERENCES public.replay_metadata(path),
  CONSTRAINT fk_replay_player_links_profile_id FOREIGN KEY (profile_id) REFERENCES public.players(profile_id),
  CONSTRAINT fk_replay_player_links_leaderboard_id FOREIGN KEY (leaderboard_id) REFERENCES public.leaderboards(id)
);
CREATE TABLE public.replay_upload_attempts (
  id bigint NOT NULL DEFAULT nextval('replay_upload_attempts_id_seq'::regclass),
  ip_hash text NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT replay_upload_attempts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.search_index_refresh_log (
  id integer NOT NULL DEFAULT nextval('search_index_refresh_log_id_seq'::regclass),
  refreshed_at timestamp with time zone DEFAULT now(),
  duration_ms integer,
  row_count integer,
  CONSTRAINT search_index_refresh_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.steam_player_count (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  app_id text NOT NULL DEFAULT '3556750'::text,
  player_count integer,
  updated_at timestamp with time zone DEFAULT now(),
  success boolean DEFAULT false,
  CONSTRAINT steam_player_count_pkey PRIMARY KEY (id)
);
