"use client";

/* eslint-disable @next/next/no-img-element */

import type { PublicTournament } from "@/lib/tournaments/types";

type TournamentPromoProps = {
  tournament: PublicTournament;
  onCtaClick?: (tournament: PublicTournament) => void;
  preview?: boolean;
};

const formatTournamentDate = (value: string): string => {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

export function TournamentPromo({
  tournament,
  onCtaClick,
  preview = false,
}: TournamentPromoProps) {
  const schedule = [
    `Starts ${formatTournamentDate(tournament.tournamentDate)}`,
    tournament.startTimeLabel ? `at ${tournament.startTimeLabel}` : null,
    tournament.timezoneLabel,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mb-1 sm:mb-2">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800/70 bg-neutral-900/70 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
        <div className="flex flex-1 items-start gap-4">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center self-center overflow-hidden rounded-xl border border-neutral-700/60 bg-neutral-800/70 p-2 shadow-inner shadow-black/30">
            <img
              src={tournament.imageUrl}
              alt={`${tournament.name} logo`}
              className="h-10 w-10 object-contain"
              loading="lazy"
            />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-neutral-400">
              {preview ? "Tournament preview" : "Tournament spotlight"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white sm:text-xl">
                {tournament.name}
              </h2>
              {tournament.prizePoolLabel && (
                <span className="inline-flex items-center gap-2 rounded-md border border-neutral-600/50 bg-neutral-700/30 px-2.5 py-0.5 text-xs font-semibold text-neutral-200 sm:text-sm">
                  <svg
                    className="h-3.5 w-3.5 text-yellow-500/80 sm:h-4 sm:w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4m7-13a4 4 0 01-4 4h-6a4 4 0 01-4-4V5h14v3zM5 5h14M5 9C3.343 9 2 7.657 2 6V5h3m14 4c1.657 0 3-1.343 3-3V5h-3" />
                  </svg>
                  {tournament.prizePoolLabel}
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-300 sm:text-base">{schedule}.</p>
            {tournament.description && (
              <p className="text-sm text-neutral-400">{tournament.description}</p>
            )}
          </div>
        </div>
        <a
          href={tournament.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onCtaClick?.(tournament)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
        >
          {tournament.ctaLabel}
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </div>
    </div>
  );
}
