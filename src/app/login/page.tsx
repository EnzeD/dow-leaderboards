"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0/client";

type SocialConnection = "google-oauth2" | "discord";

const PROVIDERS: Array<{ connection: SocialConnection; label: string }> = [
  { connection: "google-oauth2", label: "Continue with Google" },
  { connection: "discord", label: "Continue with Discord" },
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
  const { user, isLoading } = useUser();

  const returnTo = useMemo(() => {
    const raw = searchParams?.get("redirectTo");
    return sanitizeReturnTo(raw);
  }, [searchParams]);

  useEffect(() => {
    if (user && !isLoading) {
      router.replace(returnTo);
    }
  }, [user, isLoading, router, returnTo]);

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
        <div className="mb-6 text-center">
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
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map(({ connection, label }) => (
              <button
                key={connection}
                type="button"
                onClick={() => triggerLogin(connection)}
                disabled={isLoading}
                className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-neutral-100/95 px-4 py-3 text-sm font-semibold text-neutral-900 shadow transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 disabled:cursor-not-allowed disabled:bg-neutral-400/60 disabled:text-neutral-700"
              >
                {isLoading ? "Checking…" : label}
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
