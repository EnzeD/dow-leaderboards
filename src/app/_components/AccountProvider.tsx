"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import useSWR from "swr";

type AccountProfile = {
  profileId: number;
  alias: string | null;
  country: string | null;
  level: number | null;
  steamId64: string | null;
  avatarUrl: string | null;
};

type AccountResponse = {
  user: {
    sub: string;
    email: string | null;
    emailVerified: boolean | null;
    name: string | null;
    picture: string | null;
  };
  appUser: {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_subscription_status: string | null;
    stripe_subscription_cancel_at_period_end: boolean | null;
    premium_expires_at: string | null;
    primary_profile_id: number | null;
  } | null;
  subscription: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    status: string | null;
    cancelAtPeriodEnd: boolean | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    priceId: string | null;
    active: boolean;
  } | null;
  profile: AccountProfile | null;
};

type AccountContextValue = {
  account: AccountResponse | null;
  loading: boolean;
  error: Error | undefined;
  refresh: () => Promise<AccountResponse | undefined>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

const fetcher = async (key: string) => {
  // Remove query params from fetch URL (they're only for SWR cache keying)
  const url = key.split("?")[0];
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to load account session.");
  }

  return response.json();
};

type InitialUser = {
  sub: string;
  email?: string | null;
  email_verified?: boolean | null;
  name?: string | null;
  picture?: string | null;
};

type AccountProviderProps = {
  children: React.ReactNode;
  initialUser: InitialUser | null;
};

export function AccountProvider({ children, initialUser }: AccountProviderProps) {
  const fallbackAccount = useMemo<AccountResponse | null>(() => {
    if (!initialUser) return null;
    return {
      user: {
        sub: initialUser.sub,
        email: initialUser.email ?? null,
        emailVerified:
          typeof initialUser.email_verified === "boolean"
            ? initialUser.email_verified
            : initialUser.email_verified ?? null,
        name: initialUser.name ?? null,
        picture: initialUser.picture ?? null,
      },
      appUser: null,
      subscription: null,
      profile: null,
    };
  }, [initialUser]);

  const shouldFetch = Boolean(initialUser);
  // Include user ID in cache key to prevent stale data from previous sessions
  const swrKey = shouldFetch ? `/api/auth/session?sub=${initialUser?.sub}` : null;
  const {
    data,
    error,
    isValidating,
    mutate,
  } = useSWR<AccountResponse>(swrKey, fetcher, {
    fallbackData: fallbackAccount ?? undefined,
    revalidateOnFocus: true,
    revalidateIfStale: true,
    revalidateOnReconnect: true,
    dedupingInterval: 0,
  });

  const value = useMemo<AccountContextValue>(() => {
    const loading = shouldFetch ? (isValidating && !error) : false;
    const wrappedRefresh = async () => {
      if (!shouldFetch) return undefined;
      const result = await mutate();
      return result ?? undefined;
    };

    return {
      account: data ?? fallbackAccount ?? null,
      loading,
      error,
      refresh: wrappedRefresh,
    };
  }, [data, error, fallbackAccount, isValidating, mutate, shouldFetch]);

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within an AccountProvider.");
  }
  return context;
}
