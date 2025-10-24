import { getEventTracker } from './event-tracker';
import { NavigationContext } from './navigation-context';

/**
 * Helper functions for tracking common events with consistent properties
 */

export type TabName = 'leaderboards' | 'search' | 'favorites' | 'replays' | 'stats' | 'pro' | 'support';
export type PageName = 'home' | 'account' | 'profile' | 'login';

/**
 * Track tab view with rich context
 */
export function trackTabView(params: {
  tabName: TabName;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);
  const previousTab = NavigationContext.getPreviousTab();

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'tab_viewed',
    properties: {
      tab_name: params.tabName,
      previous_tab: previousTab,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track tab switch with duration on previous tab
 */
export function trackTabSwitch(params: {
  fromTab: TabName | string | null;
  toTab: TabName;
  durationMs?: number;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'tab_switched',
    properties: {
      from_tab: params.fromTab,
      to_tab: params.toTab,
      duration_ms: params.durationMs,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track page view with context
 */
export function trackPageView(params: {
  pageName: PageName;
  pageUrl?: string;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'page_view',
    event_name: 'page_viewed',
    properties: {
      page_name: params.pageName,
      page_url: params.pageUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track leaderboard interactions
 */
export function trackLeaderboardInteraction(params: {
  action: 'filter_changed' | 'leaderboard_selected' | 'player_clicked' | 'sort_changed' | 'view_expanded';
  leaderboardId?: number;
  leaderboardName?: string;
  matchType?: string;
  faction?: string;
  country?: string;
  sortBy?: string;
  limit?: number;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'leaderboard_interaction',
    properties: {
      action: params.action,
      leaderboard_id: params.leaderboardId,
      leaderboard_name: params.leaderboardName,
      match_type: params.matchType,
      faction: params.faction,
      country: params.country,
      sort_by: params.sortBy,
      limit: params.limit,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track search interactions
 */
export function trackSearchInteraction(params: {
  action: 'search_performed' | 'result_clicked' | 'autocomplete_used';
  searchQuery?: string;
  resultsCount?: number;
  selectedProfileId?: string;
  selectedPlayerName?: string;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'search_interaction',
    properties: {
      action: params.action,
      search_query: params.searchQuery,
      results_count: params.resultsCount,
      selected_profile_id: params.selectedProfileId,
      selected_player_name: params.selectedPlayerName,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track replay interactions
 */
export function trackReplayInteraction(params: {
  action: 'replay_uploaded' | 'replay_downloaded' | 'filter_applied' | 'sort_changed' | 'player_clicked';
  replayId?: string;
  filterType?: string;
  sortBy?: string;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'replay_interaction',
    properties: {
      action: params.action,
      replay_id: params.replayId,
      filter_type: params.filterType,
      sort_by: params.sortBy,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track favorites interactions
 */
export function trackFavoriteInteraction(params: {
  action: 'favorite_added' | 'favorite_removed' | 'favorite_clicked' | 'advanced_stats_expanded';
  profileId?: string;
  playerName?: string;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'favorite_interaction',
    properties: {
      action: params.action,
      profile_id: params.profileId,
      player_name: params.playerName,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track stats tab interactions
 */
export function trackStatsInteraction(params: {
  action: 'view_changed' | 'data_filtered' | 'chart_interacted';
  viewType?: 'maps' | 'pickrate' | 'matchups';
  filterType?: string;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'stats_interaction',
    properties: {
      action: params.action,
      view_type: params.viewType,
      filter_type: params.filterType,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track Pro/conversion funnel events
 */
export function trackConversionEvent(params: {
  action: 'trial_started' | 'subscription_purchased' | 'upgrade_modal_shown' | 'upgrade_modal_closed' | 'checkout_initiated' | 'billing_portal_opened' | 'subscription_cancelled' | 'subscription_renewed';
  sourceTab?: string;
  sourcePage?: string;
  profileId?: string;
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'conversion',
    event_name: params.action,
    properties: {
      source_tab: params.sourceTab,
      source_page: params.sourcePage,
      profile_id: params.profileId,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track profile views
 */
export function trackProfileView(params: {
  profileId: string;
  playerName?: string;
  source: 'search' | 'leaderboard' | 'replay' | 'favorite' | 'direct' | 'account';
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  // Also update navigation context
  NavigationContext.setLastVisitedProfile(params.profileId, params.playerName);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'profile_viewed',
    properties: {
      profile_id: params.profileId,
      player_name: params.playerName,
      source: params.source,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track account/subscription interactions
 */
export function trackAccountInteraction(params: {
  action: 'subscription_refreshed' | 'profile_linked' | 'profile_switched' | 'badge_toggled' | 'account_deleted';
  auth0Sub?: string | null;
  additionalProperties?: Record<string, any>;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'feature_interaction',
    event_name: 'account_interaction',
    properties: {
      action: params.action,
      timestamp: Date.now(),
      ...params.additionalProperties,
    },
  });
}

/**
 * Track errors
 */
export function trackError(params: {
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  context?: Record<string, any>;
  auth0Sub?: string | null;
}) {
  const tracker = getEventTracker(params.auth0Sub);

  tracker.track({
    event_type: 'error',
    event_name: 'error_occurred',
    properties: {
      error_type: params.errorType,
      error_message: params.errorMessage,
      error_stack: params.errorStack,
      context: params.context,
      timestamp: Date.now(),
    },
  });
}
