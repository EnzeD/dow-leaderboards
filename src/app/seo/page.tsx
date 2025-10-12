import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "SEO Overview | Dawn of War Leaderboards",
  description:
    "Learn how Dawn of War Leaderboards approaches search engine optimization, including metadata, structured content, and performance best practices.",
};

const checklistItems = [
  {
    title: "Metadata Hygiene",
    details: [
      "Descriptive page titles and meta descriptions for every route.",
      "Consistent Open Graph data for shareable previews.",
      "Human-readable URLs without query noise for important content.",
    ],
  },
  {
    title: "Structured Content",
    details: [
      "Semantic headings that reflect the hierarchy of information.",
      "Schema.org JSON-LD for leaderboards and player profiles where applicable.",
      "Accessible navigation that works with screen readers and keyboard users.",
    ],
  },
  {
    title: "Performance & Monitoring",
    details: [
      "Lean bundle sizes through code-splitting and caching.",
      "Image optimization with Next.js responsive tooling.",
      "Ongoing monitoring of Core Web Vitals and search impressions.",
    ],
  },
];

export default function SeoPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 text-neutral-200">
      <header className="space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-neutral-400">
          Search Visibility
        </p>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">SEO Overview</h1>
        <p className="text-base text-neutral-300 sm:text-lg">
          This page outlines the pillars that guide how we optimize Dawn of War leaderboards
          for discoverability while maintaining a fast, delightful experience for players.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        {checklistItems.map((item) => (
          <article
            key={item.title}
            className="rounded-xl border border-neutral-800/60 bg-neutral-900/70 p-6 shadow-lg shadow-black/30"
          >
            <h2 className="text-xl font-semibold text-white">{item.title}</h2>
            <ul className="mt-4 space-y-3 text-sm text-neutral-300">
              {item.details.map((detail) => (
                <li key={detail} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-neutral-800/60 bg-neutral-900/70 p-6 shadow-lg shadow-black/30">
        <h2 className="text-xl font-semibold text-white">How to Contribute</h2>
        <p className="mt-3 text-sm text-neutral-300">
          Have ideas for improving search visibility or structured data? Reach out in our community channels or{" "}
          <Link href="/" className="text-emerald-400 transition-colors hover:text-emerald-300">
            explore the leaderboards
          </Link>{" "}
          to see existing implementations.
        </p>
      </section>
    </div>
  );
}
