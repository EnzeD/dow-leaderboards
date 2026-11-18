begin;

create or replace function public.product_analytics_summary(period_days integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      (statement_timestamp() at time zone 'UTC')::date as last_day,
      (statement_timestamp() at time zone 'UTC')::date
        - (case when period_days = 7 then 6 else 29 end) as first_day
  ),
  events as materialized (
    select
      (created_at at time zone 'UTC')::date as day,
      event_type,
      event_name,
      session_id
    from public.product_events, bounds
    where created_at >= (first_day::timestamp at time zone 'UTC')
      and created_at < statement_timestamp()
  ),
  totals as (
    select
      count(*) filter (where event_type = 'page_view') as page_views,
      count(distinct session_id) as sessions,
      count(*) filter (where event_type = 'feature_interaction') as interactions
    from events
  ),
  daily as (
    select day, count(*) as views
    from events
    where event_type = 'page_view'
    group by day
  ),
  features as (
    select event_name, count(*) as interactions
    from events
    where event_type = 'feature_interaction' and event_name in (
      'leaderboard_interaction', 'search_interaction', 'replay_interaction',
      'favorite_interaction', 'stats_interaction', 'profile_viewed', 'account_interaction'
    )
    group by event_name
  )
  select jsonb_build_object(
    'pageViews', totals.page_views,
    'sessions', totals.sessions,
    'interactions', totals.interactions,
    'daily', (
      select jsonb_agg(
        jsonb_build_object('day', first_day + n, 'views', coalesce(daily.views, 0))
        order by n
      )
      from bounds
      cross join lateral generate_series(0, last_day - first_day) as days(n)
      left join daily on daily.day = first_day + n
    ),
    'features', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', event_name, 'interactions', interactions)
        order by interactions desc, event_name
      )
      from features
    ), '[]'::jsonb)
  )
  from totals;
$$;

revoke all on function public.product_analytics_summary(integer) from public, anon, authenticated;
grant execute on function public.product_analytics_summary(integer) to service_role;
notify pgrst, 'reload schema';

commit;
