-- Add page_name column for easier querying and readability
alter table public.product_events
add column if not exists page_name text generated always as (
  case
    -- Page views (includes pro, account, etc.)
    when event_name = 'page_viewed' then properties->>'page_name'

    -- Profile views (special case with profile ID)
    when event_name = 'profile_viewed' then 'profile:' || (properties->>'profile_id')

    -- Leaderboard interactions
    when event_name = 'leaderboard_interaction' then 'leaderboard'

    -- Search interactions
    when event_name = 'search_interaction' then 'search'

    -- Replay interactions
    when event_name = 'replay_interaction' then 'replays'

    -- Favorites interactions
    when event_name = 'favorite_interaction' then 'favorites'

    -- Stats interactions
    when event_name = 'stats_interaction' then 'stats'

    -- Account interactions
    when event_name = 'account_interaction' then 'account'

    -- Fallback to event_name
    else event_name
  end
) stored;

-- Create index on page_name for faster queries
create index if not exists idx_product_events_page_name on product_events(page_name);

-- Add comment
comment on column public.product_events.page_name is
  'Human-readable page/tab name extracted from event properties for easier querying';
