import { supabase } from '@/lib/supabase';

export type EventType = 'page_view' | 'feature_interaction' | 'conversion' | 'error';

export interface ProductEvent {
  event_type: EventType;
  event_name: string;
  auth0_sub?: string | null;
  session_id?: string;
  properties?: Record<string, any>;
  context?: {
    previous_tab?: string | null;
    current_tab?: string | null;
    last_visited_profile?: string | null;
    recent_profiles?: string[];
    referrer?: string;
    user_agent?: string;
    viewport?: {
      width: number;
      height: number;
    };
  };
  client_timestamp?: string;
}

/**
 * Lightweight client-side event tracker that writes directly to Supabase
 * to avoid Vercel edge function usage on the free tier.
 */
export class EventTracker {
  private queue: ProductEvent[] = [];
  private sessionId: string;
  private flushTimer?: NodeJS.Timeout;
  private isOnline: boolean = true;
  private maxQueueSize = 10;
  private flushInterval = 30000; // 30 seconds
  private auth0Sub?: string | null = null;

  constructor(auth0Sub?: string | null) {
    this.sessionId = this.getOrCreateSessionId();
    this.auth0Sub = auth0Sub;
    this.setupEventListeners();
    this.setupBatching();
  }

  /**
   * Track an event - adds to queue and flushes if needed
   */
  track(event: Omit<ProductEvent, 'session_id' | 'client_timestamp' | 'auth0_sub'>) {
    const enrichedEvent: ProductEvent = {
      ...event,
      session_id: this.sessionId,
      auth0_sub: this.auth0Sub,
      client_timestamp: new Date().toISOString(),
      context: {
        ...event.context,
        ...this.getContext(),
      },
    };

    this.queue.push(enrichedEvent);

    // Flush if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  /**
   * Manually flush all queued events
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    // Don't try to flush if offline
    if (!this.isOnline) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      // Direct insert to Supabase - bypasses Vercel entirely
      const { error } = await supabase
        .from('product_events')
        .insert(events);

      if (error) {
        console.error('Failed to send events:', error);
        // Re-queue events if failed (but cap at maxQueueSize * 2)
        if (this.queue.length < this.maxQueueSize * 2) {
          this.queue.unshift(...events);
        }
      }
    } catch (err) {
      console.error('Error sending events:', err);
      // Re-queue events if network error
      if (this.queue.length < this.maxQueueSize * 2) {
        this.queue.unshift(...events);
      }
    }
  }

  /**
   * Update the auth0 sub if user logs in
   */
  setAuth0Sub(auth0Sub: string | null) {
    this.auth0Sub = auth0Sub;
  }

  /**
   * Get or create a session ID for this browser session
   */
  private getOrCreateSessionId(): string {
    const key = 'dow_session_id';
    let sessionId = sessionStorage.getItem(key);

    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(key, sessionId);
    }

    return sessionId;
  }

  /**
   * Get context from localStorage/sessionStorage
   */
  private getContext() {
    try {
      const recentProfiles = localStorage.getItem('recentProfiles');

      return {
        previous_tab: sessionStorage.getItem('previousTab'),
        current_tab: sessionStorage.getItem('currentTab'),
        last_visited_profile: localStorage.getItem('lastVisitedProfile'),
        recent_profiles: recentProfiles ? JSON.parse(recentProfiles) : [],
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        viewport: typeof window !== 'undefined' ? {
          width: window.innerWidth,
          height: window.innerHeight,
        } : undefined,
      };
    } catch (err) {
      console.error('Error getting context:', err);
      return {};
    }
  }

  /**
   * Setup automatic batching
   */
  private setupBatching() {
    // Clear any existing timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush every 30 seconds
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Setup event listeners for online/offline and page unload
   */
  private setupEventListeners() {
    if (typeof window === 'undefined') return;

    // Track online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flush(); // Try to flush when coming back online
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush();
    });

    // Also try visibilitychange for mobile browsers
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    });
  }

  /**
   * Cleanup method to call when component unmounts
   */
  cleanup() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

// Singleton instance for the entire app
let trackerInstance: EventTracker | null = null;

/**
 * Get or create the singleton EventTracker instance
 */
export function getEventTracker(auth0Sub?: string | null): EventTracker {
  if (typeof window === 'undefined') {
    // Return a no-op tracker for SSR
    return new Proxy({} as EventTracker, {
      get() {
        return () => {};
      },
    });
  }

  if (!trackerInstance) {
    trackerInstance = new EventTracker(auth0Sub);
  } else if (auth0Sub !== undefined) {
    trackerInstance.setAuth0Sub(auth0Sub);
  }

  return trackerInstance;
}