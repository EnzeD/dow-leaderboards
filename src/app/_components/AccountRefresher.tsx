"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "./AccountProvider";

type AccountRefresherProps = {
  /**
   * If true, triggers a one-time refresh of the account session.
   * Used after checkout completion or profile linking to ensure
   * the client-side context has the latest data (including avatar).
   */
  shouldRefresh: boolean;
};

/**
 * Client component that refreshes the AccountProvider context when needed.
 * This ensures that after server-side updates (like profile linking during
 * checkout), the client-side session data is updated to show avatars, etc.
 */
export function AccountRefresher({ shouldRefresh }: AccountRefresherProps) {
  const { refresh } = useAccount();
  const hasRefreshed = useRef(false);

  useEffect(() => {
    if (shouldRefresh && !hasRefreshed.current) {
      hasRefreshed.current = true;
      refresh().catch((err) => {
        console.error("[AccountRefresher] failed to refresh session", err);
      });
    }
  }, [shouldRefresh, refresh]);

  return null;
}
