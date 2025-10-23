# Pro Rebranding & Free Trial Implementation Plan

**Status**: Ready for implementation
**Estimated Time**: 8-12 hours
**Last Updated**: 2025-10-23

## Executive Summary

Transform "Premium" to "Pro" branding across the entire application, add a clickable Pro badge system with user-controlled visibility, create a dedicated `/pro` landing page, and implement a 1-week free trial with required payment information.

**Key Goals**:
- Rebrand all "Premium" → "Pro" and "Advanced Statistics" → "Pro Analytics"
- Create golden Pro badge displayed next to all player names
- Allow users to show/hide their Pro badge in account settings
- Build conversion-optimized `/pro` landing page
- Implement 7-day free trial requiring payment method
- Maintain tone: "Become Pro to improve and support this website"

---

## Part 1: Pro Branding & Wording Changes

### 1.1 UI Components Text Changes

#### **GoPremiumButton.tsx** (`src/app/_components/premium/GoPremiumButton.tsx`)

**Changes**:
- **Line 84**: `"Go Premium"` → `"Go Pro"`
- **Line 88**: `"Link your Dawn of War profile above to enable premium checkout."` → `"Link your Dawn of War profile above to start your Pro trial."`
- **Line 156**: `"Manage subscription"` → `"Manage Pro membership"`

```typescript
// Before
{loading ? "Redirecting…" : "Go Premium"}

// After
{loading ? "Redirecting…" : "Go Pro"}
```

---

#### **AdvancedStatsPanel.tsx** (`src/app/_components/premium/AdvancedStatsPanel.tsx`)

**Changes**:
- **Line 194**: `"Advanced analytics"` → `"Pro Analytics"`
- **Line 348-354**: Update VALUE_POINTS array:

```typescript
// Before
const VALUE_POINTS = [
  "A dedicated bot to crawl your matches every day",
  "Elo ratings tracked over time",
  "Win rate broken down by faction match-up",
  "Map-by-map performance with recent form",
  "Head-to-head records against frequent opponents",
  "Unlimited match history (from activation onward)",
  "Most importantly: support this website for the long term <3",
];

// After
const VALUE_POINTS = [
  "A dedicated bot to crawl your matches every day",
  "Elo ratings tracked over time",
  "Win rate broken down by faction match-up",
  "Map-by-map performance with recent form",
  "Head-to-head records against frequent opponents",
  "Unlimited match history (from activation onward)",
  "Support Dow: DE and help us improve the site",
];
```

- **Line 388**: `"Activate advanced statistics"` → `"Go Pro"`
- **Line 395**: `"unlock advanced analytics"` → `"unlock Pro analytics"`
- **Line 397**: `"enable premium insights"` → `"enable Pro insights"`
- **Line 399**: `"advanced statistics"` → `"Pro analytics"`
- **Line 401**: `"Premium analytics require an active subscription."` → `"Pro analytics require an active membership. Start your free one-week trial."`
- **Line 403**: `"Premium analytics are temporarily unavailable."` → `"Pro analytics are temporarily unavailable."`
- **Line 433**: `"Advanced statistics"` → `"Pro analytics"`
- **Line 445**: `"Built for Dawn of War"` → `"Dow: DE Pro"`
- **Line 451**: `"Why upgrade"` → `"Why go Pro"`

```typescript
// Line 392 - reasonMessage switch statement
case "not_subscribed":
  return "Pro analytics require an active membership. Start your free one-week trial.";
```

---

#### **AdvancedStatsTeaser.tsx** (`src/app/_components/premium/AdvancedStatsTeaser.tsx`)

**Changes**:
- **Line 29**: `"Advanced statistics"` → `"Pro analytics"`
- **Line 31**:
```typescript
// Before
"This profile is not yet activated for advanced analytics. Unlock Elo trends, matchup intelligence, and more."

// After
"Become a Dow: DE Pro member to unlock Elo trends, matchup intelligence, and more."
```
- **Line 33**:
```typescript
// Before
"{alias || "Player"} can request access via the advanced statistics program."

// After
"Start your free one-week trial to access Pro features."
```
- **Line 88**: `"Request access"` → `"Start free trial"`

---

#### **AdvancedStatsIntentBanner.tsx** (`src/app/_components/AdvancedStatsIntentBanner.tsx`)

**Changes**:
- **Line 131**:
```typescript
// Before
"Ready to unlock advanced analytics for {displayAlias}?"

// After
"Ready to become a Dow: DE Pro member for {displayAlias}?"
```
- **Line 134**:
```typescript
// Before
"Finish your subscription below, or jump back to the search page once you're set."

// After
"Start your free one-week trial below to unlock Pro features, or return to search."
```
- **Line 141**: `"Start subscription flow"` → `"Start Pro trial"`

---

#### **Account Page** (`src/app/account/page.tsx`)

**Changes**:
- **Line 392**: `"Premium account (will expire)"` → `"Pro member (will expire)"`
- **Line 393**: `"Premium account"` → `"Pro member"`
- **Line 395**: `"Premium account (activation pending)"` → `"Pro member (activation pending)"`
- **Line 401**: `"Subscription renews"` / `"Premium expires"` → `"Pro membership renews"` / `"Pro membership expires"`

```typescript
// Before
const accountStatusLabel = subscriptionActive
  ? cancelAtPeriodEnd
    ? "Premium account (will expire)"
    : "Premium account"
  : pendingActivation
    ? "Premium account (activation pending)"
    : "Free account";

// After
const accountStatusLabel = subscriptionActive
  ? cancelAtPeriodEnd
    ? "Pro member (will expire)"
    : "Pro member"
  : pendingActivation
    ? "Pro member (activation pending)"
    : "Free account";
```

- **Line 411**: `"Premium benefits renew automatically"` → `"Pro membership renews automatically"`
- **Line 413**: `"Premium benefits remain active"` → `"Pro membership remains active"`

```typescript
// Before
const premiumStatusNote = subscriptionRenewing
  ? "Premium benefits renew automatically for your linked profile."
  : subscriptionActive
    ? "Premium benefits remain active until your expiry."
    : null;

// After
const premiumStatusNote = subscriptionRenewing
  ? "Pro membership renews automatically for your linked profile."
  : subscriptionActive
    ? "Pro membership remains active until your expiry."
    : null;
```

- **Line 446**: `"Manage your login, subscription, and premium analytics access."` → `"Manage your login, Pro membership, and analytics access."`
- **Line 459**:
```typescript
// Before
"Subscription confirmed! Stripe will finalise your payment shortly, and premium access unlocks automatically."

// After
"Welcome to Dow: DE Pro! Your free trial has started. You'll be charged after 7 days unless you cancel."
```
- **Line 465**:
```typescript
// Before
"Checkout cancelled. You can try again anytime using the Go Premium button below."

// After
"Checkout cancelled. You can start your free Pro trial anytime below."
```
- **Line 502**: `"Connect your in-game profile to unlock personalised insights and premium analytics."` → `"Connect your in-game profile to unlock Pro analytics."`
- **Line 515**: `"Premium & Billing"` → `"Pro membership"`
- **Line 517**:
```typescript
// Before
"Unlock advanced analytics and premium ladders with a monthly subscription."

// After
"Become a Pro member to access advanced analytics and support the site. Start your free one-week trial."
```

---

### 1.2 File/Folder Renaming (Optional)

**Recommendation**: Keep `src/app/_components/premium/` folder name for backward compatibility and avoid massive refactoring. API routes at `/api/premium/` should also remain unchanged to avoid breaking existing integrations.

**Alternative**: If you want full consistency, rename:
- `src/app/_components/premium/` → `src/app/_components/pro/`
- Update all import paths (25+ files)
- Keep API routes as `/api/premium/` (internal naming doesn't affect users)

---

### 1.3 Hook & Context Renaming (Optional)

**Current**: `useAdvancedStatsActivation` → **Suggestion**: `useProActivation`

Files to update if renaming:
- `src/hooks/useAdvancedStatsActivation.ts` → `src/hooks/useProActivation.ts`
- Update all imports in:
  - `AdvancedStatsPanel.tsx`
  - Any other components using the hook

**Current**: `AdvancedStatsContext` → **Suggestion**: `ProContext`

Files to update if renaming:
- `src/app/_components/premium/AdvancedStatsContext.tsx` → `ProContext.tsx`
- Update all imports

**Decision**: Recommend keeping internal naming for now to minimize refactoring. Focus on user-facing text only.

---

### 1.4 Documentation Files

#### **ADVANCED-STATISTICS.md** → Rename to `PRO.md`

**Changes**:
- Global find/replace: `"Premium"` → `"Pro"`
- Global find/replace: `"Advanced Statistics"` → `"Pro Analytics"`
- Global find/replace: `"subscription"` → `"Pro membership"` (where user-facing)
- Add new section at the top:

```markdown
# Pro Analytics

Dow: DE Pro provides advanced analytics to help you improve and support the site.

## Free Trial
- 7-day free trial for new members
- Payment method required
- Automatically converts to paid membership after trial
- Cancel anytime during trial with no charge
```

---

#### **CLAUDE.md** - Update references

**Lines to update**:
- Line 46-47:
```markdown
# Before
- **Not yet implemented** - mockup only for market validation

# After
- **Production Feature**: Dow: DE Pro provides advanced analytics with 7-day free trial
```

- Line 110: Update environment variables section:
```markdown
# Feature flags
NEXT_PUBLIC_ENABLE_PREMIUM_TEASER=false  # Deprecated - Pro is now live
```

---

## Part 2: Pro Badge System

### 2.1 Create ProBadge Component

**New file**: `src/components/ProBadge.tsx`

```typescript
"use client";

import Link from "next/link";

interface ProBadgeProps {
  size?: "sm" | "md" | "lg";
  clickable?: boolean;
  className?: string;
}

export default function ProBadge({
  size = "sm",
  clickable = true,
  className = ""
}: ProBadgeProps) {
  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[0.65rem]",
    md: "px-2 py-1 text-xs",
    lg: "px-2.5 py-1.5 text-sm"
  };

  const badge = (
    <span
      className={`inline-flex items-center justify-center rounded border border-amber-400/60 bg-gradient-to-br from-amber-400/30 to-amber-500/40 font-bold italic text-amber-100 shadow-sm shadow-amber-500/20 ${sizeClasses[size]} ${className}`}
      title="Dow: DE Pro member"
    >
      Pro
    </span>
  );

  if (clickable) {
    return (
      <Link
        href="/pro"
        className="inline-flex transition-transform hover:scale-105"
        onClick={(e) => e.stopPropagation()}
      >
        {badge}
      </Link>
    );
  }

  return badge;
}
```

**Design Notes**:
- Golden gradient background (`from-amber-400/30 to-amber-500/40`)
- Italic font weight for elegance
- Border with amber accent
- Subtle shadow for depth
- Clickable by default, links to `/pro` page
- Three sizes: sm (player names), md (cards), lg (hero sections)

---

### 2.2 Add Badge Visibility Setting to Database

**New migration**: `supabase/migrations/0033_add_pro_badge_visibility.sql`

```sql
-- Add show_pro_badge column to app_users
alter table public.app_users
add column if not exists show_pro_badge boolean not null default true;

comment on column public.app_users.show_pro_badge is
  'Whether the user wants to display their Pro badge publicly';
```

**Run migration**:
```bash
# Local development
psql $DATABASE_URL -f supabase/migrations/0033_add_pro_badge_visibility.sql

# Or via Supabase CLI
supabase db push
```

---

### 2.3 Create Badge Visibility API

**New file**: `src/app/api/account/badge-visibility/route.ts`

```typescript
"use server";

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

// GET: Check badge visibility setting
export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("show_pro_badge")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  if (error) {
    console.error("[account] failed to fetch badge visibility", error);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  return NextResponse.json({
    showBadge: data?.show_pro_badge ?? true
  });
}

// POST: Update badge visibility setting
export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const showBadge = typeof body?.showBadge === "boolean" ? body.showBadge : null;

  if (showBadge === null) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_users")
    .update({ show_pro_badge: showBadge })
    .eq("auth0_sub", session.user.sub);

  if (error) {
    console.error("[account] failed to update badge visibility", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, showBadge });
}
```

---

### 2.4 Add Badge Visibility UI to Account Page

**Update**: `src/app/account/page.tsx` (after profile linking section, ~line 575)

Add new section:

```tsx
<section className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg">
  <h2 className="text-xl font-semibold text-white">Pro badge visibility</h2>
  <p className="mt-2 text-sm text-neutral-400">
    Control whether your Pro badge is displayed next to your name across the site.
  </p>
  <ProBadgeToggle />
</section>
```

**New component**: `src/app/_components/ProBadgeToggle.tsx`

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import ProBadge from "@/components/ProBadge";

export function ProBadgeToggle() {
  const [showBadge, setShowBadge] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const response = await fetch("/api/account/badge-visibility");
        if (response.ok) {
          const data = await response.json();
          setShowBadge(data.showBadge ?? true);
        }
      } catch (err) {
        console.error("Failed to fetch badge visibility", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSetting();
  }, []);

  const handleToggle = useCallback(async () => {
    const newValue = !showBadge;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/account/badge-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showBadge: newValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to update setting");
      }

      setShowBadge(newValue);
    } catch (err) {
      console.error("Failed to update badge visibility", err);
      setError("Failed to save setting. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [showBadge]);

  if (loading) {
    return <p className="mt-4 text-sm text-neutral-400">Loading...</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">Show Pro badge publicly</span>
          <ProBadge size="sm" clickable={false} />
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            showBadge ? "bg-amber-500" : "bg-neutral-600"
          } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
          aria-label={showBadge ? "Hide Pro badge" : "Show Pro badge"}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              showBadge ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        When enabled, your Pro badge will appear next to your name on leaderboards, replays, match history, and search results.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
```

---

### 2.5 Add Badge Check Helper

**New file**: `src/lib/pro-badge.ts`

```typescript
import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

export type ProBadgeStatus = {
  isProMember: boolean;
  showBadge: boolean;
};

/**
 * Check if a profile should display the Pro badge
 * @param profileId - The profile ID to check
 * @returns Object with isProMember and showBadge flags
 */
export async function getProBadgeStatus(profileId: string | number): Promise<ProBadgeStatus> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { isProMember: false, showBadge: false };
  }

  // Find app_user linked to this profile
  const { data: appUser } = await supabase
    .from("app_users")
    .select("auth0_sub, show_pro_badge")
    .eq("primary_profile_id", profileId)
    .maybeSingle();

  if (!appUser) {
    return { isProMember: false, showBadge: false };
  }

  // Check subscription status
  const { data: subscription } = await supabase
    .from("premium_subscriptions")
    .select("status, current_period_end")
    .eq("auth0_sub", appUser.auth0_sub)
    .maybeSingle();

  if (!subscription) {
    return { isProMember: false, showBadge: false };
  }

  // Check if subscription is active
  const activeStatuses = ["active", "trialing", "past_due"];
  const isActive = activeStatuses.includes(subscription.status || "");

  const periodEnd = subscription.current_period_end;
  const isFuture = periodEnd ? Date.parse(periodEnd) > Date.now() : false;

  const isProMember = isActive && isFuture;
  const showBadge = isProMember && (appUser.show_pro_badge ?? true);

  return { isProMember, showBadge };
}

/**
 * Batch check Pro badge status for multiple profiles
 * More efficient than calling getProBadgeStatus multiple times
 */
export async function getBatchProBadgeStatus(
  profileIds: (string | number)[]
): Promise<Map<string | number, ProBadgeStatus>> {
  const supabase = getSupabaseAdmin();
  const resultMap = new Map<string | number, ProBadgeStatus>();

  if (!supabase || profileIds.length === 0) {
    profileIds.forEach(id => {
      resultMap.set(id, { isProMember: false, showBadge: false });
    });
    return resultMap;
  }

  // Get all app_users linked to these profiles
  const { data: appUsers } = await supabase
    .from("app_users")
    .select("auth0_sub, primary_profile_id, show_pro_badge")
    .in("primary_profile_id", profileIds);

  if (!appUsers || appUsers.length === 0) {
    profileIds.forEach(id => {
      resultMap.set(id, { isProMember: false, showBadge: false });
    });
    return resultMap;
  }

  // Get all subscriptions for these users
  const auth0Subs = appUsers.map(u => u.auth0_sub);
  const { data: subscriptions } = await supabase
    .from("premium_subscriptions")
    .select("auth0_sub, status, current_period_end")
    .in("auth0_sub", auth0Subs);

  const subscriptionMap = new Map(
    subscriptions?.map(s => [s.auth0_sub, s]) || []
  );

  // Build result map
  const activeStatuses = ["active", "trialing", "past_due"];
  const now = Date.now();

  appUsers.forEach(appUser => {
    const profileId = appUser.primary_profile_id;
    if (!profileId) return;

    const subscription = subscriptionMap.get(appUser.auth0_sub);
    if (!subscription) {
      resultMap.set(profileId, { isProMember: false, showBadge: false });
      return;
    }

    const isActive = activeStatuses.includes(subscription.status || "");
    const isFuture = subscription.current_period_end
      ? Date.parse(subscription.current_period_end) > now
      : false;

    const isProMember = isActive && isFuture;
    const showBadge = isProMember && (appUser.show_pro_badge ?? true);

    resultMap.set(profileId, { isProMember, showBadge });
  });

  // Fill in missing profiles
  profileIds.forEach(id => {
    if (!resultMap.has(id)) {
      resultMap.set(id, { isProMember: false, showBadge: false });
    }
  });

  return resultMap;
}
```

---

### 2.6 Integrate Badge into ClickablePlayer

**Update**: `src/components/ClickablePlayer.tsx`

**Add import** (after line 3):
```typescript
import ProBadge from "@/components/ProBadge";
```

**Update interface** (line 114):
```typescript
interface ClickablePlayerProps {
  profile: EnrichedReplayProfile;
  onPlayerClick?: (playerName: string, profileId?: string) => void;
  showFaction?: boolean;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
  showProBadge?: boolean; // NEW
  isProMember?: boolean;   // NEW
}
```

**Update component** (line 123):
```typescript
export default function ClickablePlayer({
  profile,
  onPlayerClick,
  showFaction = true,
  showDetails = true,
  compact = false,
  className = "",
  showProBadge = false,  // NEW
  isProMember = false,   // NEW
}: ClickablePlayerProps) {
```

**Update content rendering** (around line 150-160):
```typescript
const content = (
  <span className="inline-flex items-center gap-2">
    {/* Country flag (if available) */}
    {profile.country && (
      <FlagIcon countryCode={profile.country} />
    )}

    {/* Player name */}
    <span className="font-medium">{displayName}</span>

    {/* Pro badge (NEW) */}
    {isProMember && showProBadge && <ProBadge size="sm" />}

    {/* Faction with colored icon */}
    {showFaction && (
      <span className={`inline-flex items-center gap-1 ${factionColor}`}>
        <FactionLogo faction={profile.faction} size={compact ? 12 : 14} />
        <span className="text-xs">{profile.faction}</span>
      </span>
    )}
  </span>
);
```

---

### 2.7 Add Badge to Leaderboard Rows

**Update**: `src/app/page.tsx`

Find the leaderboard table rendering section (search for where player names are rendered).

**Add Pro badge fetching** (in the component body, before return statement):

```typescript
// Import at top
import { getBatchProBadgeStatus } from "@/lib/pro-badge";
import ProBadge from "@/components/ProBadge";

// Inside component, before rendering
const [proBadgeStatuses, setProBadgeStatuses] = useState<Map<string | number, ProBadgeStatus>>(new Map());

useEffect(() => {
  const fetchBadgeStatuses = async () => {
    if (!currentRows || currentRows.length === 0) return;

    const visibleProfileIds = currentRows.map(r => r.profileId).filter(Boolean);
    const statuses = await getBatchProBadgeStatus(visibleProfileIds);
    setProBadgeStatuses(statuses);
  };

  fetchBadgeStatuses();
}, [currentRows]);
```

**In table cell rendering** (find the cell that displays player name):
```tsx
<td className="...">
  <div className="flex items-center gap-2">
    <span>{row.playerName}</span>
    {proBadgeStatuses.get(row.profileId)?.showBadge && (
      <ProBadge size="sm" />
    )}
  </div>
</td>
```

**Note**: Since `page.tsx` is large (~42k tokens), you may need to implement this incrementally. The pattern is:
1. Fetch badge statuses for visible players
2. Store in state
3. Conditionally render `<ProBadge />` next to player names

---

### 2.8 Add Badge to Search Results

**Update**: Search results in `src/app/page.tsx` (AutocompleteSearch component)

Similar pattern to leaderboard:
1. Fetch Pro status for search results
2. Pass to search result items
3. Render badge conditionally

**Implementation** (in AutocompleteSearch component):

```tsx
{searchResults.map((player) => {
  const badgeStatus = proBadgeStatuses.get(player.profile_id);
  return (
    <button key={player.profile_id} className="...">
      <span>{player.current_alias}</span>
      {badgeStatus?.showBadge && <ProBadge size="sm" />}
    </button>
  );
})}
```

---

### 2.9 Add Badge to Replay Listings

**Update**: `src/app/_components/ReplaysTab.tsx`

Pass `isProMember` and `showProBadge` props to ClickablePlayer components:

```tsx
// Fetch badge statuses for players in replays
const uploaderProfileIds = replays.map(r => r.uploader_profile_id).filter(Boolean);
const badgeStatuses = await getBatchProBadgeStatus(uploaderProfileIds);

// In replay rendering:
{replays.map(replay => {
  const badgeStatus = badgeStatuses.get(replay.uploader_profile_id);
  return (
    <div key={replay.id}>
      <ClickablePlayer
        profile={replay.uploader_profile}
        showProBadge={badgeStatus?.showBadge || false}
        isProMember={badgeStatus?.isProMember || false}
      />
    </div>
  );
})}
```

---

### 2.10 Add Badge to Match History

**Update**: All premium cards that show player names:
- `FrequentOpponentsCard.tsx`
- `MapPerformanceCard.tsx` (match history drill-down)
- `MatchupMatrixCard.tsx` (match history drill-down)

**Pattern**:
1. Fetch opponent profile IDs from API response
2. Call `getBatchProBadgeStatus` with opponent IDs
3. Pass `showProBadge` and `isProMember` to ClickablePlayer

**Example in FrequentOpponentsCard.tsx**:

```tsx
useEffect(() => {
  const fetchOpponentsWithBadges = async () => {
    // ... existing fetch logic ...

    if (data.rows) {
      const opponentIds = data.rows
        .map(r => r.opponent_profile_id)
        .filter(Boolean);

      const badgeStatuses = await getBatchProBadgeStatus(opponentIds);
      setProBadgeStatuses(badgeStatuses);
    }
  };

  fetchOpponentsWithBadges();
}, [profileId, windowDays]);

// In rendering:
{rows.map(opponent => {
  const badgeStatus = proBadgeStatuses.get(opponent.opponent_profile_id);
  return (
    <tr key={opponent.opponent_profile_id}>
      <td>
        <ClickablePlayer
          profile={opponent}
          showProBadge={badgeStatus?.showBadge || false}
          isProMember={badgeStatus?.isProMember || false}
        />
      </td>
    </tr>
  );
})}
```

---

## Part 3: Create `/pro` Landing Page

### 3.1 Create Pro Page

**New file**: `src/app/pro/page.tsx`

```typescript
import Link from "next/link";
import { auth0 } from "@/lib/auth0";
import ProBadge from "@/components/ProBadge";
import {
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive
} from "@/lib/premium/subscription-server";

export const metadata = {
  title: "Dow: DE Pro - Advanced analytics for Dawn of War players",
  description: "Become a Pro member to unlock Elo history, matchup intelligence, map analytics, and more. Start your free one-week trial.",
};

export default async function ProPage() {
  const session = await auth0.getSession();
  let isProMember = false;
  let profileId: number | null = null;

  if (session) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const snapshot = await fetchSubscriptionSnapshot(supabase, session.user.sub);
      isProMember = isStripeSubscriptionActive(snapshot);

      const { data: appUser } = await supabase
        .from("app_users")
        .select("primary_profile_id")
        .eq("auth0_sub", session.user.sub)
        .maybeSingle();

      profileId = appUser?.primary_profile_id
        ? Number(appUser.primary_profile_id)
        : null;
    }
  }

  const ctaUrl = session
    ? profileId
      ? `/account?subscribe=true&profileId=${profileId}`
      : "/account?subscribe=true"
    : "/login?redirectTo=/pro";

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-neutral-800/50 bg-gradient-to-br from-amber-500/10 via-neutral-900 to-neutral-950 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <ProBadge size="lg" clickable={false} />
            </div>
            <h1 className="text-4xl font-bold text-white sm:text-5xl md:text-6xl">
              Become a <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">Dow: DE Pro</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-300 sm:text-xl">
              Unlock advanced analytics to improve your game and support the future of this site. Start your free one-week trial.
            </p>

            {isProMember ? (
              <div className="mt-8">
                <Link
                  href="/account"
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-6 py-3 text-lg font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  You're a Pro member
                </Link>
              </div>
            ) : (
              <div className="mt-8 flex flex-col items-center gap-4">
                <Link
                  href={ctaUrl}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500 px-8 py-4 text-xl font-bold text-neutral-900 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400"
                >
                  {session ? "Start free trial" : "Sign in to start trial"}
                </Link>
                <p className="text-sm text-neutral-400">
                  7-day free trial • Cancel anytime • No commitment
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold text-white">
            What you get as a Pro member
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "📈",
                title: "Elo history",
                description: "Track your rating progression over time across all leaderboards you compete in.",
              },
              {
                icon: "⚔️",
                title: "Matchup matrix",
                description: "Discover your strongest and weakest faction matchups with detailed win rates.",
              },
              {
                icon: "🗺️",
                title: "Map analytics",
                description: "Plan your vetoes with map-specific performance insights and recent form.",
              },
              {
                icon: "👥",
                title: "Opponent analysis",
                description: "Study frequent rivals with comprehensive head-to-head records.",
              },
              {
                icon: "🤖",
                title: "Daily match crawler",
                description: "Automated bot tracks your matches every day for comprehensive history.",
              },
              {
                icon: "💛",
                title: "Support the site",
                description: "Help maintain and improve Dow: DE for the entire community.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg transition hover:border-amber-400/40"
              >
                <div className="mb-4 text-4xl">{feature.icon}</div>
                <h3 className="mb-2 text-xl font-semibold text-white">{feature.title}</h3>
                <p className="text-sm text-neutral-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="border-t border-neutral-800/50 bg-neutral-900/50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-neutral-900/80 p-8 text-center shadow-2xl">
            <div className="mb-4 flex justify-center">
              <ProBadge size="lg" clickable={false} />
            </div>
            <h2 className="mb-4 text-3xl font-bold text-white">Simple, transparent pricing</h2>
            <div className="mb-6">
              <span className="text-5xl font-bold text-amber-400">$4.99</span>
              <span className="text-xl text-neutral-300">/month</span>
            </div>
            <p className="mb-8 text-neutral-300">
              Start with a free 7-day trial. Cancel anytime with no commitment.
            </p>
            {!isProMember && (
              <Link
                href={ctaUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500 px-8 py-4 text-xl font-bold text-neutral-900 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400"
              >
                {session ? "Start free trial" : "Sign in to start trial"}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold text-white">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "How does the free trial work?",
                a: "Your 7-day free trial starts immediately when you sign up. You'll need to provide payment information, but you won't be charged until the trial ends. Cancel anytime during the trial with no charge.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes! You can cancel your Pro membership anytime through your account page. You'll keep access until the end of your current billing period.",
              },
              {
                q: "What happens to my data if I cancel?",
                a: "Your match history and analytics remain in our database. If you resubscribe later, everything will still be there.",
              },
              {
                q: "Do I need to link my profile?",
                a: "Yes, you need to link your Dawn of War profile to access Pro features. This ensures analytics are tracked for the right account.",
              },
              {
                q: "How does the Pro badge work?",
                a: "As a Pro member, you'll get a golden Pro badge displayed next to your name across the site. You can control badge visibility in your account settings.",
              },
              {
                q: "How do I support the site?",
                a: "Becoming a Pro member directly supports the hosting, maintenance, and development of new features. Every Pro membership helps keep Dow: DE running for the community.",
              },
            ].map((faq) => (
              <details
                key={faq.q}
                className="group rounded-xl border border-neutral-700/60 bg-neutral-900/80 p-6 transition hover:border-amber-400/40"
              >
                <summary className="cursor-pointer text-lg font-semibold text-white transition group-hover:text-amber-300">
                  {faq.q}
                </summary>
                <p className="mt-4 text-sm text-neutral-400">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-neutral-800/50 py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="mb-6 text-3xl font-bold text-white">
            Ready to improve your game?
          </h2>
          <p className="mb-8 text-lg text-neutral-300">
            Join the Pro community and support Dow: DE
          </p>
          {!isProMember && (
            <Link
              href={ctaUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500 px-8 py-4 text-xl font-bold text-neutral-900 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400"
            >
              {session ? "Start your free trial" : "Sign in to start trial"}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
```

---

### 3.2 Add Navigation Link to Pro Page

**Update main navigation** (likely in `src/app/page.tsx` or a layout component):

Add prominent "Go Pro" link:

```tsx
<nav className="...">
  {/* Existing nav items */}
  <Link
    href="/pro"
    className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/30"
  >
    <ProBadge size="sm" clickable={false} />
    Go Pro
  </Link>
</nav>
```

**Styling suggestion**: Make it stand out with golden/amber colors to draw attention.

---

## Part 4: Free Trial Implementation

### 4.1 Stripe Dashboard Configuration

**IMPORTANT: You must configure this in Stripe Dashboard**

#### Steps:

1. **Log into Stripe Dashboard** → https://dashboard.stripe.com
2. **Navigate to**: Products → (Select your Dow: DE product)
3. **Click on your price** (the one referenced by `STRIPE_PRICE_ID`)
4. **Edit the price settings**:
   - Find "Free trial" section
   - Toggle **ON** "Offer a free trial"
   - Set **trial period**: `7 days`
   - Ensure **"Collect payment method during trial"** is **ENABLED**
5. **Save changes**

**Screenshot reference**: Look for these exact fields:
```
□ Offer a free trial
  Trial period: [7] days
  ☑ Collect payment method during trial
```

**Why this approach?**
- No code changes needed - Stripe handles trial logic automatically
- Checkout sessions created via API will inherit trial settings
- Webhooks will fire with `status: "trialing"`
- Automatic conversion to paid after 7 days

**Alternative**: Code-based trial (if you prefer programmatic control):
```typescript
// In src/app/api/premium/checkout/route.ts, line 153
subscription_data: {
  metadata,
  trial_period_days: 7, // Add this
},
```

**Recommendation**: Use Stripe Dashboard approach for simplicity.

---

### 4.2 Update Checkout Success Message

**File**: `src/app/account/page.tsx`

**Line 457-461** - Update success message:

```typescript
// Before
{checkoutStatus === "success" && (
  <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-6 py-4 text-sm text-emerald-100 shadow-lg">
    Subscription confirmed! Stripe will finalise your payment shortly, and premium access unlocks automatically.
  </div>
)}

// After
{checkoutStatus === "success" && (
  <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-6 py-4 text-sm text-emerald-100 shadow-lg">
    Welcome to Dow: DE Pro! Your free 7-day trial has started. You'll be charged $4.99/month after the trial ends unless you cancel.
  </div>
)}
```

---

### 4.3 Update Subscription Status Helper

**File**: `src/lib/premium/subscription-server.ts`

**Verify line 28** includes `"trialing"` (it already does):

```typescript
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
```

This ensures users on trial are treated as active Pro members.

---

### 4.4 Trial-Specific UI Indicators

**File**: `src/app/account/page.tsx`

**Around line 390** - Update account status label:

```typescript
// Before
const accountStatusLabel = subscriptionActive
  ? cancelAtPeriodEnd
    ? "Premium account (will expire)"
    : "Premium account"
  : pendingActivation
    ? "Premium account (activation pending)"
    : "Free account";

// After
const isTrialing = stripeSubscriptionStatus === "trialing";
const accountStatusLabel = subscriptionActive
  ? isTrialing
    ? "Pro member (trial)"
    : cancelAtPeriodEnd
      ? "Pro member (will expire)"
      : "Pro member"
  : pendingActivation
    ? "Pro member (activation pending)"
    : "Free account";
```

**After line 573** - Add trial countdown banner:

```typescript
{isTrialing && effectivePremiumExpiry && (
  <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
    <div className="flex items-start gap-3">
      <svg className="h-5 w-5 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      <div>
        <p className="font-semibold text-amber-100">Free trial active</p>
        <p className="mt-1">
          Your trial ends on {formatDateTime(effectivePremiumExpiry)}. You'll be charged $4.99/month after that unless you cancel.
        </p>
      </div>
    </div>
  </div>
)}
```

---

### 4.5 Update CTA Wording for Trial

**File**: `src/app/_components/premium/GoPremiumButton.tsx`

**Line 84** - Update button text:

```typescript
// Before
{loading ? "Redirecting…" : "Go Premium"}

// After
{loading ? "Starting trial…" : "Start free trial"}
```

**Add trial-specific helper text** (after line 86):

```typescript
// Before
{!profileId && (
  <p className="text-xs text-neutral-400">
    Link your Dawn of War profile above to enable premium checkout.
  </p>
)}

// After
{!profileId ? (
  <p className="text-xs text-neutral-400">
    Link your Dawn of War profile above to start your Pro trial.
  </p>
) : (
  <p className="text-xs text-neutral-400">
    7-day free trial • $4.99/month after
  </p>
)}
```

---

### 4.6 Prevent Multiple Trials (Security)

#### Add Trial Tracking to Database

**New migration**: `supabase/migrations/0034_track_trial_usage.sql`

```sql
-- Track whether user has used their free trial
alter table public.app_users
add column if not exists has_used_trial boolean not null default false;

comment on column public.app_users.has_used_trial is
  'Whether the user has previously used their free trial';
```

**Run migration**:
```bash
supabase db push
# Or manually via psql
```

---

#### Update Webhook to Mark Trial Usage

**File**: `src/app/api/stripe/webhook/route.ts`

**After line 157** (inside `updatePremiumForSubscription` function), add:

```typescript
// Mark trial as used when subscription starts with trialing status
if (subscription.status === "trialing" && resolvedAuth0Sub) {
  const { error: trialMarkError } = await supabase
    .from("app_users")
    .update({ has_used_trial: true })
    .eq("auth0_sub", resolvedAuth0Sub);

  if (trialMarkError) {
    console.error("[stripe/webhook] failed to mark trial as used", {
      auth0_sub: resolvedAuth0Sub,
      error: trialMarkError,
    });
  }
}
```

---

#### Update Checkout to Check Trial Eligibility

**File**: `src/app/api/premium/checkout/route.ts`

**After line 75** (after loading appUser), add:

```typescript
// Check if user already used trial
const hasUsedTrial = appUser?.has_used_trial ?? false;

if (hasUsedTrial) {
  return NextResponse.json({
    error: "trial_already_used",
    message: "You've already used your free trial. You can still subscribe for $4.99/month."
  }, { status: 400 });
}
```

**Note**: This blocks users from getting multiple trials. If you prefer to allow re-subscription without trial, create two Stripe prices:
- Price 1: With 7-day trial (for new users)
- Price 2: Without trial (for returning users)

---

### 4.7 Show Trial Eligibility in UI

**File**: `src/app/account/page.tsx`

**Around line 100** (after loading appUser data), add:

```typescript
const hasUsedTrial = appUser?.has_used_trial ?? false;
const isTrialEligible = !hasUsedTrial && !subscriptionActive;
```

**Update button helper text** (around line 570):

```typescript
{showGoPremium && !pendingActivation && (
  <>
    <GoPremiumButton
      profileId={primaryProfileId}
      premiumExpiresAt={effectivePremiumExpiry}
      isPremiumActive={subscriptionActive}
    />
    {isTrialEligible && (
      <p className="text-xs text-amber-300">
        Start your free 7-day trial • No charge until trial ends
      </p>
    )}
    {!isTrialEligible && !subscriptionActive && (
      <p className="text-xs text-neutral-400">
        $4.99/month • Cancel anytime
      </p>
    )}
  </>
)}
```

---

### 4.8 Update Pro Page with Trial Eligibility

**File**: `src/app/pro/page.tsx`

**After loading user data** (around line 20), add:

```typescript
let hasUsedTrial = false;
if (session && supabase) {
  const { data: appUser } = await supabase
    .from("app_users")
    .select("has_used_trial")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  hasUsedTrial = appUser?.has_used_trial ?? false;
}

const isTrialEligible = session && !hasUsedTrial && !isProMember;
```

**Update CTA helper text** (around line 50):

```typescript
// Before
<p className="text-sm text-neutral-400">
  7-day free trial • Cancel anytime • No commitment
</p>

// After
<p className="text-sm text-neutral-400">
  {isTrialEligible
    ? "7-day free trial • Cancel anytime • No commitment"
    : "$4.99/month • Cancel anytime"
  }
</p>
```

---

## Part 5: Additional Wording Updates

### 5.1 Error Messages

**Update all API routes** that return `"not_subscribed"` error:

**Files to update**:
- `src/app/api/premium/overview/route.ts`
- `src/app/api/premium/elo-history/route.ts`
- `src/app/api/premium/matchups/route.ts`
- `src/app/api/premium/maps/route.ts`
- `src/app/api/premium/opponents/route.ts`

**Pattern** (find and replace in each file):

```typescript
// Before
return NextResponse.json({
  error: "not_subscribed"
}, { status: 403 });

// After
return NextResponse.json({
  error: "pro_membership_required",
  message: "Pro membership required. Start your free 7-day trial to access this feature."
}, { status: 403 });
```

---

### 5.2 Console Log Prefixes (Optional)

**Find all instances** of `[premium]` log prefix:

```bash
grep -r "\[premium\]" src/
```

**Optional replacement** (for consistency):
```typescript
// Before
console.error("[premium] failed to fetch subscription");

// After
console.error("[pro] failed to fetch subscription");
```

**Recommendation**: Keep as `[premium]` for backward compatibility in logs. Not user-facing.

---

### 5.3 Page Metadata & SEO

**Update metadata** in pages that mention premium:

#### Account Page (`src/app/account/page.tsx`)

Add at top of file:

```typescript
export const metadata = {
  title: "Account - Dow: DE Pro",
  description: "Manage your Dow: DE Pro membership, linked profile, and analytics access.",
};
```

#### Pro Page (already done in Part 3.1)

Already includes metadata with Pro branding.

---

### 5.4 Email Templates (If Applicable)

If you have transactional emails (e.g., via Stripe):

1. **Update Stripe email settings**:
   - Go to Stripe Dashboard → Settings → Emails
   - Customize trial start, trial ending, subscription renewal emails
   - Replace "Premium" with "Dow: DE Pro"

2. **Custom email templates** (if you send any):
   - Update all "Premium" → "Pro"
   - Update all "subscription" → "Pro membership"
   - Add trial messaging

---

## Part 6: Testing Checklist

### 6.1 Badge Testing

- [ ] **Leaderboards**: Pro badge displays next to Pro members' names
- [ ] **Badge click**: Badge links to `/pro` page
- [ ] **Badge visibility toggle**: User can hide/show badge in account settings
- [ ] **Badge hidden**: Badge respects user's visibility setting (hidden when toggled off)
- [ ] **Search results**: Badge shows in autocomplete search results
- [ ] **Replay listings**: Badge shows next to replay uploader names
- [ ] **Match history**: Badge shows in Pro analytics match history tables
- [ ] **Badge styling**: Golden gradient background, italic font, proper sizing
- [ ] **Performance**: Badge fetching doesn't slow down page loads

---

### 6.2 Trial Testing

- [ ] **New user trial**: New user can start free trial with payment method
- [ ] **Trial status**: Trial status shows "Pro member (trial)" in account page
- [ ] **Trial countdown**: Trial expiration date displays correctly
- [ ] **Multiple trials blocked**: User cannot start multiple trials
- [ ] **Trial conversion**: Trial converts to paid after 7 days automatically
- [ ] **Trial cancellation**: Canceling during trial prevents charge
- [ ] **Webhook updates**: Stripe webhook correctly updates trial status
- [ ] **Pro features work**: All Pro features accessible during trial
- [ ] **Badge during trial**: Pro badge displays during trial period

---

### 6.3 Pro Page Testing

- [ ] **Public access**: `/pro` page loads for all users (logged out, logged in, Pro members)
- [ ] **CTA for guests**: Non-logged-in users see "Sign in to start trial"
- [ ] **CTA for members**: Logged-in non-Pro users see "Start free trial"
- [ ] **Already Pro**: Pro members see "You're a Pro member" message
- [ ] **Navigation**: "Go Pro" link in main navigation works
- [ ] **Badge clickability**: Clicking any Pro badge navigates to `/pro` page
- [ ] **Responsive design**: Page looks good on mobile, tablet, desktop
- [ ] **FAQ accordion**: FAQ items expand/collapse correctly

---

### 6.4 Wording Testing

- [ ] **"Premium" removed**: All user-facing "Premium" text updated to "Pro"
- [ ] **"Advanced Statistics" removed**: Updated to "Pro Analytics"
- [ ] **Trial messaging**: "Start your free 7-day trial" appears in relevant places
- [ ] **Account page labels**: Status shows "Pro member" instead of "Premium account"
- [ ] **Error messages**: Updated error messages mention "Pro membership required"
- [ ] **Button text**: "Go Pro" and "Start free trial" buttons appear correctly
- [ ] **Checkout success**: Success message mentions trial and $4.99/month charge

---

### 6.5 Existing Subscriber Testing

- [ ] **Unaffected subscribers**: Existing paid subscribers see Pro branding
- [ ] **No trial for existing**: Existing subscribers don't see trial messaging
- [ ] **Badge control**: Existing subscribers can toggle badge visibility
- [ ] **No billing changes**: Existing subscriptions continue without interruption
- [ ] **Pro features**: All Pro features continue working for existing subscribers
- [ ] **Account page**: Existing subscribers see correct status labels

---

### 6.6 Stripe Integration Testing

- [ ] **Checkout session**: Checkout session creates successfully with trial
- [ ] **Payment method required**: Trial requires valid payment method
- [ ] **Webhook handling**: All subscription webhooks handled correctly
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `checkout.session.completed`
- [ ] **Trial end webhook**: Webhook fires when trial ends
- [ ] **Conversion**: User charged correctly after trial ends
- [ ] **Billing portal**: Stripe billing portal accessible and functional

---

## Part 7: Rollout Strategy

### Phase 1: Backend Infrastructure (2-3 hours)

**Database**:
1. Run `0033_add_pro_badge_visibility.sql` migration
2. Run `0034_track_trial_usage.sql` migration
3. Verify migrations applied successfully

**Code**:
1. Create `ProBadge.tsx` component
2. Create `src/lib/pro-badge.ts` helpers
3. Create `src/app/api/account/badge-visibility/route.ts`
4. Test API endpoints with curl/Postman

**Verification**:
```bash
# Test badge visibility API
curl -X GET http://localhost:3000/api/account/badge-visibility \
  -H "Cookie: appSession=..."

# Test update
curl -X POST http://localhost:3000/api/account/badge-visibility \
  -H "Content-Type: application/json" \
  -H "Cookie: appSession=..." \
  -d '{"showBadge": false}'
```

---

### Phase 2: UI Rebranding (3-4 hours)

**Text Changes**:
1. Update `GoPremiumButton.tsx`
2. Update `AdvancedStatsPanel.tsx`
3. Update `AdvancedStatsTeaser.tsx`
4. Update `AdvancedStatsIntentBanner.tsx`
5. Update `account/page.tsx`
6. Run `npm run typecheck` to verify no errors

**Badge Integration**:
1. Add `ProBadgeToggle` component to account page
2. Integrate badge into `ClickablePlayer`
3. Add badge to leaderboard tables
4. Add badge to search results
5. Add badge to replay listings
6. Add badge to match history

**Testing**:
- Start dev server: `npm run dev`
- Navigate to each page and verify text changes
- Test badge toggle functionality

---

### Phase 3: Pro Page (1-2 hours)

**Implementation**:
1. Create `src/app/pro/page.tsx`
2. Add navigation link to Pro page
3. Test all CTAs and user states (logged out, logged in, Pro member)

**Verification**:
- Visit `/pro` as guest → should see "Sign in to start trial"
- Visit `/pro` as logged-in user → should see "Start free trial"
- Visit `/pro` as Pro member → should see "You're a Pro member"

---

### Phase 4: Trial Configuration (1 hour)

**Stripe Dashboard**:
1. Log into Stripe
2. Navigate to Products → Your product
3. Edit price to add 7-day trial
4. Enable "Collect payment method during trial"
5. Save changes

**Code Updates**:
1. Update webhook to mark `has_used_trial` flag
2. Update checkout to check trial eligibility
3. Update success messages
4. Add trial-specific UI indicators

**Testing (Stripe Test Mode)**:
```bash
# Use test cards from Stripe docs
# Card: 4242 4242 4242 4242
# Expiry: Any future date
# CVC: Any 3 digits
```

- Test trial signup flow
- Verify webhook fires with `status: "trialing"`
- Check account page shows trial status
- Test cancellation during trial

---

### Phase 5: Testing & Deployment (1-2 hours)

**Pre-deployment checklist**:
- [ ] All text changes applied
- [ ] TypeScript builds successfully (`npm run typecheck`)
- [ ] Badge system functional
- [ ] Pro page accessible
- [ ] Trial configuration complete
- [ ] Existing subscribers unaffected
- [ ] Test mode Stripe testing passed

**Deployment**:
1. Commit changes to Git
2. Push to main branch
3. Vercel auto-deploys (or manual deploy)
4. Run production smoke tests

**Post-deployment monitoring**:
- Watch Vercel logs for errors
- Monitor Stripe Dashboard for new trials
- Check Supabase database for badge visibility data
- Verify existing subscribers still have access

---

## Part 8: Stripe Configuration Details

### Option A: Dashboard Configuration (Recommended)

**Advantages**:
- No code changes needed
- Easy to modify trial period
- Centralized configuration
- Automatic inheritance by all checkout sessions

**Steps**:
1. Stripe Dashboard → Products → Select product
2. Click on your price (e.g., "$4.99/month")
3. Click "Edit price"
4. Find "Free trial" section
5. Toggle **ON**: "Offer a free trial"
6. Set: `7` days
7. Ensure: "Collect payment method during trial" is **checked**
8. Save

**Result**:
- All new checkouts automatically include 7-day trial
- Webhooks fire with `subscription.status = "trialing"`
- After 7 days, Stripe charges the customer
- If payment fails, status becomes `past_due`

---

### Option B: Code-Based Configuration

**If you prefer programmatic control** (not recommended unless needed):

**File**: `src/app/api/premium/checkout/route.ts`

**Update line 153**:

```typescript
// Before
subscription_data: {
  metadata,
},

// After
subscription_data: {
  metadata,
  trial_period_days: 7, // Add this line
},
```

**Advantage**: More flexibility (can vary trial length per user)
**Disadvantage**: Requires code deployment to change trial period

---

### Trial Behavior

**During trial**:
- Subscription status: `"trialing"`
- Customer has full access to Pro features
- No charge yet
- Payment method on file

**Trial ends**:
- Stripe automatically charges the customer
- Status changes to `"active"`
- Webhook fires: `customer.subscription.updated`
- Customer continues to have access

**If customer cancels during trial**:
- Status changes to `"canceled"`
- Webhook fires: `customer.subscription.deleted`
- Access immediately removed (based on your code logic)
- Customer not charged

**If payment fails after trial**:
- Status changes to `"past_due"`
- Stripe retries payment (per your settings)
- Access remains active (based on your code - you have `"past_due"` in `ACTIVE_STATUSES`)

---

## Part 9: Edge Cases & Considerations

### 9.1 Existing Subscribers

**Scenario**: User currently has active subscription (no trial)

**Expected behavior**:
- No trial offered
- Badge displays (if enabled)
- Pro page shows "You're a Pro member"
- Account page shows "Pro member"

**Testing**:
- Verify existing subscribers unaffected by changes
- Ensure no accidental downgrade or status change

---

### 9.2 Trial Abuse Prevention

**Implemented**:
- `has_used_trial` flag in database
- Checkout route checks flag before creating session
- Webhook marks flag as `true` when trial starts

**Additional measures** (optional):
1. **Email verification**: Require verified email before trial
2. **Rate limiting**: Limit checkout attempts per IP
3. **Payment verification**: Use Stripe's fraud detection
4. **Manual review**: Flag suspicious signups

---

### 9.3 Trial Expiration Email

**Stripe handles this automatically**:
- Sends "Trial ending soon" email (3 days before)
- Sends "Subscription active" email (after first charge)

**Customize in Stripe Dashboard**:
- Settings → Emails → Customize templates
- Add Pro branding and messaging

---

### 9.4 Refund Policy

**Consider adding to `/pro` page FAQ**:

```markdown
### What's your refund policy?

We offer refunds on a case-by-case basis. If you're not satisfied with Pro,
contact us within 7 days of your first charge and we'll issue a full refund.
```

---

### 9.5 Multiple Profile Linking

**Current limitation**: One profile per account

**User scenario**: User wants to switch linked profile

**Solution** (already implemented in account page):
- User can manually change `primary_profile_id` in account settings
- Pro benefits transfer to new profile
- Badge follows the new profile

---

## Part 10: Post-Launch Monitoring

### 10.1 Key Metrics to Track

**Trial Conversion Rate**:
```sql
SELECT
  COUNT(CASE WHEN status = 'trialing' THEN 1 END) as total_trials,
  COUNT(CASE WHEN status = 'active' AND has_used_trial THEN 1 END) as converted_trials,
  ROUND(
    100.0 * COUNT(CASE WHEN status = 'active' AND has_used_trial THEN 1 END) /
    NULLIF(COUNT(CASE WHEN has_used_trial THEN 1 END), 0),
    2
  ) as conversion_rate
FROM app_users
WHERE has_used_trial = true;
```

**Badge Visibility Rate**:
```sql
SELECT
  COUNT(*) as total_pro_members,
  COUNT(CASE WHEN show_pro_badge THEN 1 END) as badges_visible,
  ROUND(100.0 * COUNT(CASE WHEN show_pro_badge THEN 1 END) / COUNT(*), 2) as visibility_rate
FROM app_users au
JOIN premium_subscriptions ps ON au.auth0_sub = ps.auth0_sub
WHERE ps.status IN ('active', 'trialing', 'past_due')
  AND ps.current_period_end > NOW();
```

**Trial Cancellation Rate**:
```sql
-- Track in Stripe Dashboard
-- Look for "Trial conversions" metric
```

---

### 10.2 Error Monitoring

**Watch for**:
- `[pro]` or `[premium]` errors in Vercel logs
- Stripe webhook failures in Stripe Dashboard
- Database errors in Supabase logs
- Failed checkout attempts

**Set up alerts**:
- Vercel: Configure error notifications
- Stripe: Enable webhook failure alerts
- Supabase: Monitor query performance

---

### 10.3 User Feedback

**Collect feedback on**:
- Trial experience
- Pro feature value
- Badge design/placement
- Pricing perception

**Methods**:
- In-app feedback form
- Email survey after trial ends
- Discord/community channels
- Support tickets

---

## Part 11: Future Enhancements

### 11.1 Annual Billing Option

**Implementation**:
1. Create second Stripe price ($49.99/year, ~17% discount)
2. Add toggle on Pro page: Monthly vs Annual
3. Update checkout to use selected price
4. Add "Save $10/year" badge on annual option

---

### 11.2 Referral Program

**Concept**: Give 1 month free for each successful referral

**Implementation**:
1. Generate unique referral codes per user
2. Track referrals in database
3. Apply Stripe coupon for successful referrals
4. Show referral stats in account page

---

### 11.3 Team/Clan Subscriptions

**Concept**: Bulk pricing for competitive teams

**Implementation**:
1. Create team entity in database
2. Link multiple profiles to team
3. Single payment covers all team members
4. Team badge instead of individual badges

---

### 11.4 Pro Badge Customization

**Concept**: Allow Pro members to choose badge color/style

**Options**:
- Golden (default)
- Silver
- Bronze
- Custom clan colors

**Implementation**:
- Add `badge_style` column to `app_users`
- Update `ProBadge` component to support variants
- Add customization UI to account page

---

### 11.5 Analytics Dashboard

**Concept**: Dedicated Pro analytics dashboard

**Features**:
- Win streak tracking
- Personal leaderboard history
- Faction mastery levels
- Comparative stats vs other Pro members

**Route**: `/dashboard` (Pro members only)

---

## Summary

### Files Created (10 new files)
1. `src/components/ProBadge.tsx`
2. `src/lib/pro-badge.ts`
3. `src/app/api/account/badge-visibility/route.ts`
4. `src/app/_components/ProBadgeToggle.tsx`
5. `src/app/pro/page.tsx`
6. `supabase/migrations/0033_add_pro_badge_visibility.sql`
7. `supabase/migrations/0034_track_trial_usage.sql`
8. `docs/pro-rebranding-implementation-plan.md` (this file)

### Files Modified (25+ files)
1. `src/app/_components/premium/GoPremiumButton.tsx`
2. `src/app/_components/premium/AdvancedStatsPanel.tsx`
3. `src/app/_components/premium/AdvancedStatsTeaser.tsx`
4. `src/app/_components/AdvancedStatsIntentBanner.tsx`
5. `src/app/account/page.tsx`
6. `src/components/ClickablePlayer.tsx`
7. `src/app/page.tsx` (leaderboards, search, navigation)
8. `src/app/_components/ReplaysTab.tsx`
9. `src/app/_components/premium/FrequentOpponentsCard.tsx`
10. `src/app/_components/premium/MapPerformanceCard.tsx`
11. `src/app/_components/premium/MatchupMatrixCard.tsx`
12. `src/app/api/stripe/webhook/route.ts`
13. `src/app/api/premium/checkout/route.ts`
14. `src/lib/premium/subscription-server.ts` (verify)
15. `ADVANCED-STATISTICS.md` → Rename to `PRO.md`
16. `CLAUDE.md`
17. Plus all API routes with error messages

### Database Changes (2 migrations)
1. Add `show_pro_badge` column to `app_users`
2. Add `has_used_trial` column to `app_users`

### Stripe Configuration
1. Enable 7-day free trial in Stripe Dashboard
2. Require payment method during trial
3. Optionally customize email templates

### Estimated Implementation Time
- **Backend infrastructure**: 2-3 hours
- **UI rebranding**: 3-4 hours
- **Pro page**: 1-2 hours
- **Trial configuration**: 1 hour
- **Testing & deployment**: 1-2 hours
- **Total**: 8-12 hours

---

## Ready to Implement?

This plan provides:
✅ Complete Pro rebranding (50+ text changes)
✅ Pro badge system with golden styling
✅ Badge display everywhere player names appear
✅ User-controlled badge visibility
✅ Dedicated `/pro` landing page
✅ 7-day free trial with payment method
✅ Trial eligibility tracking
✅ Comprehensive testing checklist
✅ Rollout strategy
✅ Future enhancement ideas

**Next steps**:
1. Review this plan with stakeholders
2. Set up development environment
3. Start with Phase 1 (Backend infrastructure)
4. Follow rollout strategy sequentially
5. Test thoroughly before production deploy

Good luck with the implementation! 🚀
