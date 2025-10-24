"use client";

import Link from "next/link";
import Image from "next/image";
import ProBadge from "@/components/ProBadge";
import { useAccount } from "./AccountProvider";

export default function ProTab() {
  const { account } = useAccount();
  const isProMember = account?.subscription?.active ?? false;
  const profileId = account?.profile?.profileId ?? null;
  const authUser = account?.user ?? null;
  const hasUsedTrial = account?.appUser?.has_used_trial ?? false;
  const isTrialEligible = authUser && !hasUsedTrial && !isProMember;

  const ctaUrl = authUser
    ? profileId
      ? `/account?subscribe=true&profileId=${profileId}`
      : "/account?subscribe=true"
    : "/login?redirectTo=/account";

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-amber-500/5 via-neutral-900/60 to-neutral-900/80 border border-amber-400/20 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="max-w-3xl mx-auto text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Become</h2>
            <ProBadge size="lg" clickable={false} />
          </div>
          <p className="text-base sm:text-lg text-neutral-300 mb-6">
            Track what matters. Fix your weaknesses. Climb faster.
          </p>

          {isProMember ? (
            <Link
              href="/account"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-6 py-2.5 text-base font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="flex items-center gap-1">You're already <span className="scale-90"><ProBadge size="sm" clickable={false} /></span></span>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Link
                href={ctaUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500 px-6 py-3 text-lg font-bold text-neutral-900 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
              >
                {authUser ? "Start 7-day trial" : "Sign in to start"}
              </Link>
              <p className="text-xs text-neutral-400">
                {isTrialEligible
                  ? "7-day free trial • Cancel anytime • No commitment"
                  : "$4.99/month • Cancel anytime"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Elo History Section */}
      <div className="bg-neutral-900/60 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="grid lg:grid-cols-[1fr_3fr] gap-14 items-center">
          <div className="order-2 lg:order-1">
            <div className="mb-3 text-xs italic text-amber-400/80">
              "The Emperor tracks."
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Track your progress over time</h3>
            <p className="text-neutral-300 text-sm sm:text-base mb-4 leading-relaxed">
              Every ranked player asks: "Am I actually improving?" <span className="inline-flex items-center scale-75 -mx-1"><ProBadge size="sm" clickable={false} /></span> answers that question. See your Elo trajectory across all ladders, spot when you're tilting, and identify the patches where you peaked. No guessing, just data.
            </p>
            <ul className="space-y-2 text-sm text-neutral-400">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Historical Elo tracking from the day you activate</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>See exactly when you're on a winning streak or need a break</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Compare performance across different ladders and modes</span>
              </li>
            </ul>
          </div>
          <div className="order-1 lg:order-2">
            <div className="relative rounded-lg overflow-hidden border border-neutral-700/40 shadow-2xl hover:shadow-amber-500/10 transition-shadow">
              <Image
                src="/assets/advanced-stats-examples/elo-history.png"
                alt="Elo history chart showing rating progression over time"
                width={1200}
                height={600}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Matchups Section */}
      <div className="bg-neutral-900/60 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="grid lg:grid-cols-[3fr_1fr] gap-14 items-center">
          <div className="order-1">
            <div className="relative rounded-lg overflow-hidden border border-neutral-700/40 shadow-2xl hover:shadow-amber-500/10 transition-shadow">
              <Image
                src="/assets/advanced-stats-examples/matchups.png"
                alt="Matchup matrix showing win rates by faction"
                width={1200}
                height={800}
                className="w-full h-auto"
              />
            </div>
          </div>
          <div className="order-2">
            <div className="mb-3 text-xs italic text-amber-400/80">
              "The Emperor reveals."
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Find your bad matchups</h3>
            <p className="text-neutral-300 text-sm sm:text-base mb-4 leading-relaxed">
              You know you struggle against certain factions, but which ones exactly? The matchup matrix breaks down your win rate for every faction pairing. Stop blaming balance patches and start fixing the matchups you actually lose.
            </p>
            <ul className="space-y-2 text-sm text-neutral-400">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Win rates for every faction combination you've played</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Identify which matchups need practice</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Track improvement as you master difficult matchups</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Maps Section */}
      <div className="bg-neutral-900/60 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="grid lg:grid-cols-[1fr_3fr] gap-14 items-center">
          <div className="order-2 lg:order-1">
            <div className="mb-3 text-xs italic text-amber-400/80">
              "The Emperor guides."
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Master your map pool</h3>
            <p className="text-neutral-300 text-sm sm:text-base mb-4 leading-relaxed">
              Vetoes matter in ranked. Map analytics shows your win rate and recent form on every map. Struggling on a specific map? You'll see it instantly. Dominating certain maps? Prioritize them in your veto strategy.
            </p>
            <ul className="space-y-2 text-sm text-neutral-400">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Win rates broken down by each map</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Recent form indicators show if you're improving or slipping</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Make informed veto decisions based on actual data</span>
              </li>
            </ul>
          </div>
          <div className="order-1 lg:order-2">
            <div className="relative rounded-lg overflow-hidden border border-neutral-700/40 shadow-2xl hover:shadow-amber-500/10 transition-shadow">
              <Image
                src="/assets/advanced-stats-examples/maps.png"
                alt="Map performance breakdown with win rates"
                width={1200}
                height={800}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Opponents Section */}
      <div className="bg-neutral-900/60 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="grid lg:grid-cols-[3fr_1fr] gap-14 items-center">
          <div className="order-1">
            <div className="relative rounded-lg overflow-hidden border border-neutral-700/40 shadow-2xl hover:shadow-amber-500/10 transition-shadow">
              <Image
                src="/assets/advanced-stats-examples/opponents.png"
                alt="Head-to-head records against frequent opponents"
                width={1200}
                height={600}
                className="w-full h-auto"
              />
            </div>
          </div>
          <div className="order-2">
            <div className="mb-3 text-xs italic text-amber-400/80">
              "The Emperor knows."
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Study your rivals</h3>
            <p className="text-neutral-300 text-sm sm:text-base mb-4 leading-relaxed">
              Queue into the same players often? <span className="inline-flex items-center scale-75 -mx-1"><ProBadge size="sm" clickable={false} /></span> tracks your head-to-head records against everyone you face regularly. See who you dominate, who's your nemesis, and which matchups you need to study replays for.
            </p>
            <ul className="space-y-2 text-sm text-neutral-400">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Head-to-head records with frequent opponents</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>See which players consistently beat you</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">✓</span>
                <span>Track your improvement against specific rivals over time</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Automated Tracking */}
      <div className="bg-neutral-900/60 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="text-center max-w-2xl mx-auto">
          <div className="mb-3 text-xs italic text-amber-400/80">
            "The Emperor provides."
          </div>
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Set it and forget it</h3>
          <p className="text-neutral-300 text-sm sm:text-base mb-4 leading-relaxed">
            A dedicated bot crawls your matches every day automatically. Play your games, and your stats are waiting for you. No manual uploads, no hassle. Just play and improve.
          </p>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-gradient-to-br from-amber-500/5 via-neutral-900/60 to-neutral-900/80 border border-amber-400/20 rounded-lg p-6 sm:p-8 shadow-xl">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-3 flex justify-center">
            <ProBadge size="md" clickable={false} />
          </div>
          <div className="mb-4">
            <span className="text-4xl font-bold text-amber-400">$4.99</span>
            <span className="text-lg text-neutral-300">/month</span>
          </div>
          <p className="text-sm text-neutral-400 mb-6">
            7-day free trial. No commitment. Less than a coffee per month to support the site and improve faster.
          </p>
          {!isProMember && (
            <Link
              href={ctaUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500 px-6 py-3 text-lg font-bold text-neutral-900 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
            >
              {authUser ? "Start 7-day trial" : "Sign in to start"}
            </Link>
          )}
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-neutral-900/60 border border-neutral-600/30 rounded-lg p-6 sm:p-8 shadow-xl">
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">Questions</h3>
        <div className="space-y-3 max-w-2xl mx-auto">
          <details className="group rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 transition hover:border-amber-400/30">
            <summary className="cursor-pointer text-sm font-semibold text-white transition group-hover:text-amber-300">
              How does the trial work?
            </summary>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              7 days, completely free. You need to add a payment method, but you won't be charged until the trial ends. Cancel anytime during the trial and pay nothing.
            </p>
          </details>

          <details className="group rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 transition hover:border-amber-400/30">
            <summary className="cursor-pointer text-sm font-semibold text-white transition group-hover:text-amber-300">
              Can I cancel anytime?
            </summary>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              Yes. Cancel through your account page whenever you want. You keep access until your current billing period ends.
            </p>
          </details>

          <details className="group rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 transition hover:border-amber-400/30">
            <summary className="cursor-pointer text-sm font-semibold text-white transition group-hover:text-amber-300">
              What if I cancel and rejoin later?
            </summary>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              All your historical data stays in the database. Rejoin whenever and pick up right where you left off.
            </p>
          </details>

          <details className="group rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 transition hover:border-amber-400/30">
            <summary className="cursor-pointer text-sm font-semibold text-white transition group-hover:text-amber-300">
              Do I need to link my profile first?
            </summary>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              Yes. <span className="inline-flex items-center scale-75 -mx-1"><ProBadge size="sm" clickable={false} /></span> tracks stats for your specific profile, so we need to know which one is yours.
            </p>
          </details>

          <details className="group rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 transition hover:border-amber-400/30">
            <summary className="cursor-pointer text-sm font-semibold text-white transition group-hover:text-amber-300">
              Why does this cost money?
            </summary>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              Running dedicated crawlers, storing historical data, and maintaining this site costs real money. <span className="inline-flex items-center scale-75 -mx-1"><ProBadge size="sm" clickable={false} /></span> keeps the lights on while giving you better tools to improve.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
