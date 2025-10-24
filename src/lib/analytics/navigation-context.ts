/**
 * Client-side navigation context manager using localStorage and sessionStorage
 * to track user navigation patterns without server calls.
 */
export class NavigationContext {
  private static readonly PREVIOUS_TAB_KEY = 'previousTab';
  private static readonly CURRENT_TAB_KEY = 'currentTab';
  private static readonly LAST_VISITED_PROFILE_KEY = 'lastVisitedProfile';
  private static readonly RECENT_PROFILES_KEY = 'recentProfiles';
  private static readonly MAX_RECENT_PROFILES = 5;

  /**
   * Set the current tab and move current to previous
   */
  static setCurrentTab(tab: string) {
    if (typeof window === 'undefined') return;

    try {
      const currentTab = sessionStorage.getItem(this.CURRENT_TAB_KEY);
      if (currentTab && currentTab !== tab) {
        sessionStorage.setItem(this.PREVIOUS_TAB_KEY, currentTab);
      }
      sessionStorage.setItem(this.CURRENT_TAB_KEY, tab);
    } catch (err) {
      console.error('Error setting current tab:', err);
    }
  }

  /**
   * Get the previous tab
   */
  static getPreviousTab(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      return sessionStorage.getItem(this.PREVIOUS_TAB_KEY);
    } catch (err) {
      console.error('Error getting previous tab:', err);
      return null;
    }
  }

  /**
   * Get the current tab
   */
  static getCurrentTab(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      return sessionStorage.getItem(this.CURRENT_TAB_KEY);
    } catch (err) {
      console.error('Error getting current tab:', err);
      return null;
    }
  }

  /**
   * Set the last visited profile and update recent profiles list
   */
  static setLastVisitedProfile(profileId: string, playerName?: string) {
    if (typeof window === 'undefined') return;

    try {
      // Update last visited
      localStorage.setItem(this.LAST_VISITED_PROFILE_KEY, profileId);

      // Update recent profiles list
      const recentRaw = localStorage.getItem(this.RECENT_PROFILES_KEY);
      const recent: Array<{ id: string; name?: string; timestamp: number }> =
        recentRaw ? JSON.parse(recentRaw) : [];

      // Remove if already exists and add to front
      const filtered = recent.filter(p => p.id !== profileId);
      const updated = [
        { id: profileId, name: playerName, timestamp: Date.now() },
        ...filtered,
      ].slice(0, this.MAX_RECENT_PROFILES);

      localStorage.setItem(this.RECENT_PROFILES_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Error setting last visited profile:', err);
    }
  }

  /**
   * Get the last visited profile ID
   */
  static getLastVisitedProfile(): string | null {
    if (typeof window === 'undefined') return null;

    try {
      return localStorage.getItem(this.LAST_VISITED_PROFILE_KEY);
    } catch (err) {
      console.error('Error getting last visited profile:', err);
      return null;
    }
  }

  /**
   * Get recent profiles list
   */
  static getRecentProfiles(): Array<{ id: string; name?: string; timestamp: number }> {
    if (typeof window === 'undefined') return [];

    try {
      const recentRaw = localStorage.getItem(this.RECENT_PROFILES_KEY);
      return recentRaw ? JSON.parse(recentRaw) : [];
    } catch (err) {
      console.error('Error getting recent profiles:', err);
      return [];
    }
  }

  /**
   * Clear all navigation context (useful for privacy or logout)
   */
  static clear() {
    if (typeof window === 'undefined') return;

    try {
      sessionStorage.removeItem(this.PREVIOUS_TAB_KEY);
      sessionStorage.removeItem(this.CURRENT_TAB_KEY);
      localStorage.removeItem(this.LAST_VISITED_PROFILE_KEY);
      localStorage.removeItem(this.RECENT_PROFILES_KEY);
    } catch (err) {
      console.error('Error clearing navigation context:', err);
    }
  }

  /**
   * Clean up old data (remove profiles older than 30 days)
   */
  static cleanup() {
    if (typeof window === 'undefined') return;

    try {
      const recentRaw = localStorage.getItem(this.RECENT_PROFILES_KEY);
      if (!recentRaw) return;

      const recent: Array<{ id: string; name?: string; timestamp: number }> = JSON.parse(recentRaw);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      const filtered = recent.filter(p => p.timestamp > thirtyDaysAgo);

      if (filtered.length !== recent.length) {
        localStorage.setItem(this.RECENT_PROFILES_KEY, JSON.stringify(filtered));
      }
    } catch (err) {
      console.error('Error cleaning up navigation context:', err);
    }
  }
}