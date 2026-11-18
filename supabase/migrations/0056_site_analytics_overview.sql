begin;

create or replace function public.site_analytics_overview(period_days integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  with clock as (
    select statement_timestamp() as as_of, case when period_days = 7 then 7 else 30 end as days
  ),
  current_window as (
    select as_of, days, date_trunc('day', as_of, 'UTC') - make_interval(days => days - 1) as from_at
    from clock
  ),
  windows as (
    select 'current' as period, from_at, as_of as until_at from current_window
    union all
    select 'previous', from_at - make_interval(days => days), as_of - make_interval(days => days)
    from current_window
  ),
  events as materialized (
    select
      w.period, e.id, e.created_at, e.session_id, e.event_type, e.event_name, e.page_name,
      e.properties->>'page_url' as page_url,
      e.context->>'referrer' as referrer,
      lower(coalesce(e.context->>'user_agent', '')) as agent,
      case when e.context->>'country' ~ '^[A-Z]{2}$' then e.context->>'country' end as country
    from windows w
    join public.product_events e on e.created_at >= w.from_at and e.created_at < w.until_at
    where e.event_type in ('page_view', 'feature_interaction')
  ),
  sessions as materialized (
    select
      period, session_id,
      (min(created_at) filter (where event_type = 'page_view') at time zone 'UTC')::date as day,
      count(*) filter (where event_type = 'page_view') as views,
      count(*) filter (where event_type = 'page_view') = 1
        and count(*) filter (where event_type = 'feature_interaction') = 0 as bounced
    from events
    group by period, session_id
    having count(*) filter (where event_type = 'page_view') > 0
  ),
  latest_views as materialized (
    select
      id, created_at, session_id, page_name,
      (created_at at time zone 'UTC')::date as day,
      case
        when page_name = 'home' then '/'
        when page_name in ('account', 'login') then '/' || page_name
      end as path,
      lower(substring(page_url from '^https?://([a-zA-Z0-9.-]+)(?:[/:?#]|$)')) as hostname,
      lower(substring(referrer from '^(?:https?://|android-app://)([a-zA-Z0-9.-]+)(?:[/:?#]|$)')) as source_host,
      substring(split_part(page_url, '#', 1) from '[?&]utm_source=([a-zA-Z0-9._~%+-]{1,255})(?:&|$)') as campaign_source,
      substring(split_part(page_url, '#', 1) from '[?&]utm_medium=([a-zA-Z0-9._~%+-]{1,255})(?:&|$)') as campaign_medium,
      substring(split_part(page_url, '#', 1) from '[?&]utm_campaign=([a-zA-Z0-9._~%+-]{1,255})(?:&|$)') as campaign_name,
      case
        when agent = '' then 'Unknown'
        when agent ~ '(bot\y|spider|crawler|headless)' then 'Bot'
        when agent ~ '(ipad|tablet|kindle|silk)' or (agent like '%android%' and agent not like '%mobile%') then 'Tablet'
        when agent ~ '(mobile|iphone|ipod|android)' then 'Mobile'
        else 'Desktop'
      end as device,
      case
        when agent ~ '(edg/|edga/|edgios/)' then 'Edge'
        when agent ~ '(opr/|opera)' then 'Opera'
        when agent ~ '(firefox/|fxios/)' then 'Firefox'
        when agent like '%samsungbrowser/%' then 'Samsung Internet'
        when agent like '%gsa/%' then 'Google app'
        when agent like '%; wv%' then 'Android WebView'
        when agent ~ '(chrome/|crios/|chromium/)' then 'Chrome'
        when agent like '%safari/%' then 'Safari'
        when agent = '' then 'Unknown'
        else 'Other'
      end as browser_name,
      case
        when agent like '%android%' then 'Android'
        when agent ~ '(iphone|ipad|ipod)' then 'iOS'
        when agent like '%windows%' then 'Windows'
        when agent like '%cros %' then 'ChromeOS'
        when agent ~ '(macintosh|mac os)' then 'macOS'
        when agent like '%linux%' then 'Linux'
        when agent = '' then 'Unknown'
        else 'Other'
      end as os,
      country
    from events
    where period = 'current' and event_type = 'page_view'
  ),
  landings as materialized (
    select distinct on (session_id) *
    from latest_views
    order by session_id, created_at, id
  ),
  located as materialized (
    select distinct on (session_id) session_id, country
    from latest_views
    where country is not null and country <> 'ZZ'
    order by session_id, created_at, id
  ),
  dimensions as (
    select 'pages' as dimension, path as label, session_id from latest_views where path is not null
    union all select 'hostnames', hostname, session_id from latest_views where hostname is not null
    union all
      select 'sections', split_part(page_name, ':', 1), session_id from latest_views
      where split_part(page_name, ':', 1) in ('leaderboards','search','favorites','replays','stats','pro','support','profile')
    union all select 'referrers',
      case when source_host is null or source_host in ('www.dow-de.com', 'dow-de.com')
        then 'Direct / unknown' else source_host end, session_id from landings
    union all select 'campaigns', 'Source: ' || campaign_source, session_id from landings where campaign_source is not null
    union all select 'campaigns', 'Medium: ' || campaign_medium, session_id from landings where campaign_medium is not null
    union all select 'campaigns', 'Campaign: ' || campaign_name, session_id from landings where campaign_name is not null
    union all select 'countries', country, session_id from located
    union all select 'devices', device, session_id from landings
    union all select 'browsers', browser_name, session_id from landings
    union all select 'operatingSystems', os, session_id from landings
  ),
  ranked_dimensions as (
    select dimension, label, count(distinct session_id) as sessions,
      row_number() over (partition by dimension order by count(distinct session_id) desc, label) as rank
    from dimensions
    group by dimension, label
    union all
    select 'features', event_name, count(*), row_number() over (order by count(*) desc, event_name)
    from events
    where period = 'current' and event_type = 'feature_interaction' and event_name in (
      'leaderboard_interaction', 'search_interaction', 'replay_interaction',
      'favorite_interaction', 'stats_interaction', 'profile_viewed', 'account_interaction'
    )
    group by event_name
  ),
  breakdown as (
    select dimension, jsonb_agg(jsonb_build_object('label', label, 'sessions', sessions) order by rank) as rows
    from ranked_dimensions
    where rank <= 10
    group by dimension
  ),
  totals as (
    select
      w.period, count(s.session_id) as visits, coalesce(sum(s.views), 0) as views,
      round(100.0 * count(*) filter (where s.bounced) / nullif(count(s.session_id), 0), 1) as bounce
    from windows w
    left join sessions s on s.period = w.period
    group by w.period
  ),
  daily_sessions as (
    select day, count(*) as visits, round(100.0 * count(*) filter (where bounced) / count(*), 1) as bounce
    from sessions
    where period = 'current'
    group by day
  ),
  daily_views as (
    select day, count(*) as views from latest_views group by day
  ),
  daily as (
    select (w.from_at at time zone 'UTC')::date + n as day
    from current_window w
    cross join lateral generate_series(0, w.days - 1) as days(n)
  )
  select jsonb_build_object(
    'totals', (select jsonb_object_agg(period, jsonb_build_object(
      'sessions', visits, 'pageViews', views, 'bounceRate', bounce
    )) from totals),
    'daily', (select jsonb_agg(jsonb_build_object(
      'day', daily.day, 'pageViews', coalesce(v.views, 0),
      'sessions', coalesce(s.visits, 0), 'bounceRate', s.bounce
    ) order by daily.day) from daily
      left join daily_views v using (day)
      left join daily_sessions s using (day)),
    'breakdowns', coalesce((select jsonb_object_agg(dimension, rows) from breakdown), '{}'::jsonb),
    'countryCoverage', (select count(*) from located)
  );
$$;

revoke all on function public.site_analytics_overview(integer) from public, anon, authenticated;
grant execute on function public.site_analytics_overview(integer) to service_role;
notify pgrst, 'reload schema';

commit;
