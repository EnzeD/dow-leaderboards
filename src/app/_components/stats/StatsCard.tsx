"use client";

import type { ReactNode } from "react";

type StatsCardProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function StatsCard({ title, description, actions, children }: StatsCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description ? (
            <p className="max-w-3xl text-sm text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2 text-sm text-neutral-300">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="mt-4">
        {children}
      </div>
    </section>
  );
}
