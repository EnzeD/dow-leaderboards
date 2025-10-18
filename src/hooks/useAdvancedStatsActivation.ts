"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ActivationPayload = {
  activated: boolean;
  reason?: string;
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | null;
  profileId?: number | null;
};

type ActivationState = ActivationPayload & {
  loading: boolean;
  lastFetchedAt?: string;
  error?: string | null;
};

const activationCache = new Map<string, ActivationState>();

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

      let payload: ActivationPayload | null = null;
      try {
        payload = (await response.json()) as ActivationPayload;
      } catch {
        payload = null;
      }

      const nextState: ActivationState = {
        activated: Boolean(payload?.activated),
        status: payload?.status ?? null,
        cancelAtPeriodEnd: payload?.cancelAtPeriodEnd ?? null,
        currentPeriodEnd: payload?.currentPeriodEnd ?? null,
        profileId: payload?.profileId ?? null,
        reason: payload?.reason,
        loading: false,
        lastFetchedAt: new Date().toISOString(),
        error: response.ok ? null : payload?.reason ?? `http_${response.status}`,
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
