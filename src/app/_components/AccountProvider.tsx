"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import useSWR from "swr";
import { useUser } from "@auth0/nextjs-auth0/client";

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
  profile: AccountProfile | null;
};

type AccountContextValue = {
  account: AccountResponse | null;
  loading: boolean;
  error: Error | undefined;
  refresh: () => Promise<AccountResponse | undefined>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

const fetcher = async (url: string) => {
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

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
  const {
    data,
    error,
    isValidating,
    mutate,
  } = useSWR<AccountResponse>(user ? "/api/auth/session" : null, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
  });

  const value = useMemo<AccountContextValue>(() => {
    const loading = isLoading || (user ? (!data && !error) : false) || isValidating;
    const wrappedRefresh = async () => {
      const result = await mutate();
      return result ?? undefined;
    };

    return {
      account: data ?? null,
      loading,
      error,
      refresh: wrappedRefresh,
    };
  }, [data, error, isLoading, isValidating, mutate, user]);

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
