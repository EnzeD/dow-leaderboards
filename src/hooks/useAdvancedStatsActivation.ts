"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ActivationPayload = {
  activated: boolean;
  activatedAt?: string;
  expiresAt?: string | null;
  reason?: string;
  forced?: boolean;
};

type ActivationState = ActivationPayload & {
  loading: boolean;
  lastFetchedAt?: string;
  error?: string | null;
};

const coerceBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const forcedProfilesEnv = (() => {
  const raw = process.env.NEXT_PUBLIC_FORCE_ADVANCED_STATS_PROFILE;
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
  );
})();

const forceAllEnv = coerceBoolean(process.env.NEXT_PUBLIC_FORCE_ADVANCED_STATS);

const activationCache = new Map<string, ActivationState>();

const getForcedState = (): ActivationState => ({
  activated: true,
  forced: true,
  loading: false,
  reason: "env_override",
});

const getDefaultState = (): ActivationState => ({
  activated: false,
  loading: false,
});

export const useAdvancedStatsActivation = (profileId?: string | number | null) => {
  const normalizedProfileId = useMemo(() => {
    if (profileId === undefined || profileId === null) return null;
    const cast = String(profileId).trim();
    return cast.length > 0 ? cast : null;
  }, [profileId]);

  const [state, setState] = useState<ActivationState>(() => {
    if (forceAllEnv) return getForcedState();
    if (normalizedProfileId && forcedProfilesEnv.has(normalizedProfileId)) {
      return getForcedState();
    }
    if (normalizedProfileId && activationCache.has(normalizedProfileId)) {
      return activationCache.get(normalizedProfileId)!;
    }
    return getDefaultState();
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!normalizedProfileId) {
      setState(getDefaultState());
      return;
    }

    if (forceAllEnv || forcedProfilesEnv.has(normalizedProfileId)) {
      const forcedState = getForcedState();
      activationCache.set(normalizedProfileId, forcedState);
      setState(forcedState);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    try {
      const response = await fetch(`/api/premium/activation-status?profileId=${encodeURIComponent(normalizedProfileId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn("[premium] activation API returned non-200", response.status, response.statusText);
      }

      const payload = (await response.json()) as ActivationPayload;

      const nextState: ActivationState = {
        ...payload,
        loading: false,
        lastFetchedAt: new Date().toISOString(),
        error: response.ok ? null : payload.reason ?? `http_${response.status}`,
      };

      activationCache.set(normalizedProfileId, nextState);
      setState(nextState);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        return;
      }
      console.error("[premium] activation fetch failed", error);
      const fallback: ActivationState = {
        activated: false,
        loading: false,
        reason: "fetch_error",
        error: (error as Error)?.message ?? "unknown",
      };
      setState(fallback);
    }
  }, [normalizedProfileId]);

  useEffect(() => {
    fetchStatus();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchStatus]);

  const refresh = useCallback(() => fetchStatus(), [fetchStatus]);

  return {
    ...state,
    profileId: normalizedProfileId,
    refresh,
  };
};

export type UseAdvancedStatsActivationResult = ReturnType<typeof useAdvancedStatsActivation>;

