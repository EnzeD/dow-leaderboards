"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleIcon,
  DiscordIcon,
  ArrowLeftIcon,
} from "@/components/icons";
import { useAccount } from "@/app/_components/AccountProvider";

type SocialConnection = "google-oauth2" | "discord";

const PROVIDERS: Array<{
  connection: SocialConnection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    connection: "google-oauth2",
    label: "Continue with Google",
    icon: GoogleIcon,
  },
  {
    connection: "discord",
    label: "Continue with Discord",
    icon: DiscordIcon,
  },
];

const sanitizeReturnTo = (value: string | null): string => {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { account, loading } = useAccount();
  const user = account?.user ?? null;

  const returnTo = useMemo(() => {
    const raw = searchParams?.get("redirectTo");
    return sanitizeReturnTo(raw);
  }, [searchParams]);

  useEffect(() => {
    if (user && !loading) {
      router.replace(returnTo);
    }
  }, [user, loading, router, returnTo]);

  const triggerLogin = (connection: SocialConnection) => {
    const params = new URLSearchParams();
    params.set("returnTo", returnTo);
    params.set("connection", connection);
    window.location.assign(`/auth/login?${params.toString()}`);
  };

  const triggerLogout = () => {
    const params = new URLSearchParams();
    params.set("returnTo", returnTo);
    window.location.assign(`/auth/logout?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-neutral-900/90 p-8 shadow-2xl ring-1 ring-neutral-700/70 backdrop-blur">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 rounded-md px-2 py-1 -ml-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">
            Sign in to Dawn of War Analytics
          </h1>
          <p className="mt-2 text-sm text-neutral-300">
            Use Google or Discord to save preferences and unlock premium
            analytics.
          </p>
        </div>

        {user ? (
          <div className="mb-6 rounded-lg bg-neutral-800/70 p-4 text-sm text-neutral-200">
            <p className="font-medium">Signed in as</p>
            <p className="break-words text-base font-semibold text-white">
              {user.email ?? user.name ?? user.sub}
            </p>
            <button
              type="button"
              onClick={triggerLogout}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map(({ connection, label, icon: Icon }) => (
              <button
                key={connection}
                type="button"
                onClick={() => triggerLogin(connection)}
                disabled={loading}
                className="relative inline-flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300/20 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm transition-all hover:bg-neutral-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white disabled:hover:shadow-sm"
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{loading ? "Checking…" : label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900/90 p-8 text-center text-neutral-300 shadow-2xl ring-1 ring-neutral-700/70 backdrop-blur">
            Loading login experience…
          </div>
        </div>
      )}
    >
      <LoginPageContent />
    </Suspense>
  );
}
