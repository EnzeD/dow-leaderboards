# Stripe Subscription Playbook

This guide captures the end-to-end workflow for wiring Stripe subscriptions into the advanced analytics gating. Each step lists the goal, concrete actions, and the output you should save back in the repository or environment variables.

> **Terminology**
> - **Profile ID** — the Supabase `players.profile_id` that should gain access after purchase.
> - **Premium activation** — a row in `public.premium_feature_activations` that toggles advanced stats on/off.

---

## ✅ Step 1 – Stripe Account Preparation

| What you need | Notes | Value |
|---------------|-------|-------|
| Product name | e.g. “Advanced Analytics Access” | |
| Price ID (`price_…`) | Monthly subscription price in Stripe | |
| Publishable key (`pk_…`) | Found under *Developers → API keys* | |
| Secret key (`sk_…`) | Found under *Developers → API keys* | |
| Webhook signing secret (`whsec_…`) | Created when you add the webhook endpoint in step 6 | |
| Customer portal return URL | Where Stripe sends users after managing billing | |

**Actions**
1. Log into the Stripe dashboard (test mode for development).
2. Create or reuse a *Product* with a **recurring** *Price* (monthly/annual).
3. Capture the price ID and API keys above. Paste them into the table (or directly into your secrets manager).

> 💡 Tip: For testing, enable test cards and configure the Customer Portal (Billing → Customer portal) so users can cancel on their own.

---

## Step 2 – Environment & Configuration

- Add the saved values to `.env.local` / deployment secrets:
  ```
  STRIPE_SECRET_KEY=
  STRIPE_PUBLIC_KEY=
  STRIPE_WEBHOOK_SECRET=
  STRIPE_PRICE_ID=
  STRIPE_PORTAL_RETURN_URL=https://your-site.com/profile
  ```
- Expose `STRIPE_PUBLIC_KEY` and `STRIPE_PRICE_ID` via `next.config.js` or `process.env.NEXT_PUBLIC_*`.

---

## Step 3 – Map Profiles to Stripe Customers

1. Decide how you identify profiles (email + profile_id).
2. Extend Supabase tables if needed:
   ```sql
   alter table public.players
     add column stripe_customer_id text,
     add column stripe_subscription_id text;
   ```
3. Ensure you can look up a Supabase profile by Stripe customer ID during webhooks.

---

## Step 4 – Checkout Session Endpoint

- Add `POST /api/premium/checkout`:
  - Fetch or create a Stripe Customer for the current profile.
  - Create a subscription Checkout Session (mode: `subscription`, `line_items` with `STRIPE_PRICE_ID`).
  - Return `session.url` so the client can redirect.
  - Write the Stripe customer ID back to Supabase.

---

## Step 5 – Client Integration

- Replace the “Activate advanced statistics” button handler:
  ```ts
  const response = await fetch("/api/premium/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId, email }),
  });
  const { url } = await response.json();
  window.location.href = url;
  ```
- Handle `?checkout=success|cancelled` to display confirmation messages.
- Optional: Show a “Manage subscription” link that calls a portal endpoint (see Step 8).

---

## Step 6 – Stripe Webhook Handler

- Add `/api/stripe/webhook` (Edge or Node runtime).
- Verify the signature using `stripe.webhooks.constructEvent`.
- Handle:
  - `checkout.session.completed` → mark `premium_feature_activations` with `expires_at` = current period end.
  - `customer.subscription.updated` / `deleted` → update or revoke access based on status.
- Store processed webhook event IDs to guard against retries (idempotency).

---

## Step 7 – Activation Storage

- Use the admin Supabase client to update:
  ```ts
  await supabase
    .from("premium_feature_activations")
    .upsert({
      profile_id,
      activated_at: new Date().toISOString(),
      expires_at: subscription.status === "active"
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : new Date().toISOString(),
      notes: "stripe_auto",
    });
  ```
- Ensure the existing activation resolver treats expired rows as inactive (already implemented).

---

## Step 8 – Customer Portal (Optional but recommended)

- Add `POST /api/premium/portal` to call `stripe.billingPortal.sessions.create({ customer, return_url })`.
- Show “Manage billing” for active subscribers only (using `stripe_customer_id` and presence in `premium_feature_activations`).

---

## Step 9 – Testing Playbook

- Use Stripe **test mode**.
- Run through checkout with `4242 4242 4242 4242`.
- Confirm:
  - Webhook marks the profile activated.
  - Hidden advanced stats become visible.
  - Cancellation via dashboard or portal deactivates after the paid period.

---

## Step 10 – Production Launch Checklist

- [ ] All secrets stored in deployment environment.
- [ ] Webhook endpoint reachable and secured.
- [ ] Logging / monitoring of webhook failures.
- [ ] Supabase fallback task (optional) that clears expired activations nightly.
- [ ] Documentation updated for support staff.
