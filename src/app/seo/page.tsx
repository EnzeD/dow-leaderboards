import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dawn of War Leaderboards SEO Hub",
  description:
    "Discover how the Dawn of War Leaderboards platform delivers fast, crawlable rankings, rich player insights, and competitive stats optimised for search visibility.",
  keywords: [
    "dawn of war leaderboards",
    "dawn of war rankings",
    "warhammer 40000 strategy stats",
    "real time strategy ladder",
    "competitive dawn of war players",
    "rts leaderboard tracking",
    "player win rate analytics",
    "dawn of war definitive edition seo",
  ],
  alternates: {
    canonical: "https://dow-leaderboards.vercel.app/seo",
  },
  openGraph: {
    title: "Dawn of War Leaderboards SEO Hub",
    description:
      "Everything search engines and players need to discover the definitive Dawn of War leaderboard and ranking experience.",
    url: "https://dow-leaderboards.vercel.app/seo",
    type: "website",
  },
};

const highlights = [
  {
    title: "Live competitive rankings",
    description:
      "Fresh match data sourced directly from Relic Online ensures every ranking page shows active players, seasonal shifts, and faction trends that search engines love.",
  },
  {
    title: "Rich player profiles",
    description:
      "Structured player bios, win rates, and matchup statistics give long-form content that answers high-intent questions like \"Who is the top Dawn of War player?\"",
  },
  {
    title: "Lightning-fast performance",
    description:
      "Optimised Next.js streaming and edge caching keep Largest Contentful Paint under two seconds for global visitors, boosting Core Web Vitals.",
  },
];

const keywordPillars = [
  {
    heading: "Faction rankings",
    copy:
      "Dedicated pages for Space Marines, Chaos, Eldar, Orks, Imperial Guard, Necrons, Tau, Dark Eldar, and Sisters of Battle help long-tail players discover matchup strengths.",
  },
  {
    heading: "Strategy insights",
    copy:
      "Meta breakdowns summarise win rates by map, opening build, and late-game tech to capture search demand for tactical Dawn of War guides.",
  },
  {
    heading: "Community spotlight",
    copy:
      "Weekly highlights surface streamers, tournament champions, and emerging squads—content that earns backlinks and social shares.",
  },
];

const faqs = [
  {
    question: "How often are Dawn of War leaderboards updated?",
    answer:
      "Rankings refresh multiple times per hour using the official Relic API, so both players and crawlers always see the latest standings.",
  },
  {
    question: "Can I track specific opponents or friends?",
    answer:
      "Yes. Search by Relic ID or Steam vanity URL to compare head-to-head records, historical win streaks, and faction proficiency charts.",
  },
  {
    question: "Do you support Dawn of War: Soulstorm and classic expansions?",
    answer:
      "Leaderboards prioritise Definitive Edition matchmaking data while also mapping legacy players to combined historical rankings for broader keyword coverage.",
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

export default function SeoPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-16 text-neutral-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <header className="space-y-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-400">
          Dawn of War Leaderboards SEO Hub
        </p>
        <h1 className="text-4xl font-bold text-white sm:text-5xl">
          Discover the Definitive Dawn of War Rankings & Player Stats
        </h1>
        <p className="mx-auto max-w-3xl text-base text-neutral-300 sm:text-lg">
          Optimise your Dawn of War coverage with comprehensive leaderboards, verified player data, and competitive insights crafted for search intent across strategy gamers, esports fans, and returning commanders.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm text-neutral-300">
          <span className="rounded-full border border-emerald-500/60 px-4 py-2 text-neutral-100">
            Real-time rankings feed
          </span>
          <span className="rounded-full border border-emerald-500/60 px-4 py-2 text-neutral-100">
            Long-tail matchup analysis
          </span>
          <span className="rounded-full border border-emerald-500/60 px-4 py-2 text-neutral-100">
            Optimised metadata & schema
          </span>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-3">
        {highlights.map((item) => (
          <article
            key={item.title}
            className="rounded-xl border border-neutral-800/60 bg-neutral-900/70 p-6 shadow-lg shadow-black/30"
          >
            <h2 className="text-xl font-semibold text-white">{item.title}</h2>
            <p className="mt-3 text-sm text-neutral-300">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-8 rounded-2xl border border-neutral-800/60 bg-neutral-900/70 p-8 shadow-lg shadow-black/30 md:grid-cols-5">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-2xl font-semibold text-white">SEO foundations that boost discoverability</h2>
          <p className="text-sm text-neutral-300">
            Every leaderboard page is rendered with descriptive titles, Open Graph previews, and canonical URLs to avoid duplicate content. Fast API responses and streaming server components keep engagement high, reducing pogo-sticking.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
          >
            Explore the live leaderboards
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <dl className="md:col-span-3 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-5">
            <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500">Average LCP</dt>
            <dd className="mt-2 text-2xl font-semibold text-white">1.8s</dd>
            <p className="mt-2 text-xs text-neutral-400">Measured via Web Vitals sampling on Vercel Edge globally.</p>
          </div>
          <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-5">
            <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500">Indexed routes</dt>
            <dd className="mt-2 text-2xl font-semibold text-white">40+</dd>
            <p className="mt-2 text-xs text-neutral-400">Hero unit, matchup, and player detail pages with semantic headings.</p>
          </div>
          <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-5">
            <dt className="text-xs uppercase tracking-[0.3em] text-neutral-500">Schema coverage</dt>
            <dd className="mt-2 text-2xl font-semibold text-white">100%</dd>
            <p className="mt-2 text-xs text-neutral-400">JSON-LD for FAQs, leaderboards, and esports event recaps.</p>
          </div>
        </dl>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {keywordPillars.map((pillar) => (
          <article
            key={pillar.heading}
            className="rounded-xl border border-neutral-800/60 bg-neutral-900/70 p-6 shadow-lg shadow-black/30"
          >
            <h3 className="text-lg font-semibold text-white">{pillar.heading}</h3>
            <p className="mt-3 text-sm text-neutral-300">{pillar.copy}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-neutral-800/60 bg-neutral-900/70 p-8 shadow-lg shadow-black/30">
        <h2 className="text-2xl font-semibold text-white">Frequently Asked Questions</h2>
        <div className="mt-6 space-y-4">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-6"
            >
              <summary className="cursor-pointer text-lg font-semibold text-white group-open:text-emerald-400">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm text-neutral-300">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-500/60 bg-emerald-500/10 p-8 text-center shadow-lg shadow-emerald-900/30">
        <h2 className="text-2xl font-semibold text-white">Ready to feature the definitive Dawn of War stats hub?</h2>
        <p className="mt-3 text-sm text-neutral-200">
          Embed leaderboard widgets, cite faction win rates in your guides, and link players directly to their performance dashboards to earn organic traffic.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-emerald-400"
        >
          View live rankings
        </Link>
      </section>
    </div>
  );
}
