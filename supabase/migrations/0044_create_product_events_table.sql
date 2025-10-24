-- Create product_events table for lightweight client-side analytics
create table public.product_events (
  id bigserial primary key,
  event_type text not null,
  event_name text not null,
  auth0_sub text,
  session_id text not null,
  properties jsonb,
  context jsonb,
  created_at timestamptz not null default now(),

  -- Add client_timestamp for accuracy
  client_timestamp timestamptz,

  -- Foreign key to app_users (optional, can be null for anonymous events)
  constraint fk_app_user foreign key (auth0_sub)
    references public.app_users(auth0_sub) on delete set null
);

-- Indexes for performance
create index idx_product_events_created_at on product_events(created_at desc);
create index idx_product_events_event_type on product_events(event_type);
create index idx_product_events_event_name on product_events(event_type, event_name);
create index idx_product_events_session_id on product_events(session_id);
create index idx_product_events_auth0_sub on product_events(auth0_sub) where auth0_sub is not null;

-- Enable RLS for client-side writes
alter table public.product_events enable row level security;

-- Policy: Allow anyone to insert events (needed for client-side tracking)
create policy "Anyone can insert events"
  on public.product_events
  for insert
  with check (true);

-- Policy: Users can only read their own events (authenticated)
create policy "Authenticated users can view their own events"
  on public.product_events
  for select
  using (
    auth0_sub = auth.jwt() ->> 'sub'
  );

-- Policy: Service role has full access
create policy "Service role has full access to product_events"
  on public.product_events
  for all
  using (auth.role() = 'service_role');

-- Comments for documentation
comment on table public.product_events is
  'Lightweight product analytics events tracked directly from client-side to minimize Vercel usage';

comment on column public.product_events.event_type is
  'Type of event: page_view, feature_interaction, conversion, error';

comment on column public.product_events.event_name is
  'Specific event name like page_viewed, profile_viewed, trial_started';

comment on column public.product_events.session_id is
  'Client-generated session ID for grouping events';

comment on column public.product_events.properties is
  'Event-specific properties as JSON';

comment on column public.product_events.context is
  'Context information like previous_tab, last_visited_profile, referrer';

comment on column public.product_events.client_timestamp is
  'Timestamp from client for accuracy when batching events';