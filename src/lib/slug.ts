/**
 * Generates SEO-friendly URL slugs from replay titles
 * Example: "Epic Match! SM vs Chaos 🔥" → "epic-match-sm-vs-chaos"
 */

/**
 * Slugify a string for use in URLs
 * - Max 60 chars (SEO best practice)
 * - Lowercase, hyphens only
 * - Remove accents, special chars
 * - Trim leading/trailing hyphens
 */
export function slugify(text: string, maxLength = 60): string {
  return text
    .toString()
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove accent marks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces/hyphens
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim hyphens from ends
    .substring(0, maxLength) // Limit length
    .replace(/-$/g, ''); // Remove trailing hyphen if substring cut mid-word
}

/**
 * Generate replay slug with fallback chain
 * Priority: submitted_name > replay_name > original_name > "replay"
 */
export function generateReplaySlug(replay: {
  submitted_name?: string | null;
  replay_name?: string | null;
  original_name?: string | null;
}): string {
  const source =
    replay.submitted_name?.trim() ||
    replay.replay_name?.trim() ||
    replay.original_name?.trim() ||
    'replay';

  const slug = slugify(source);
  return slug || 'replay'; // Fallback if everything strips out
}

/**
 * Build full replay URL
 * Format: /replays/[slug]-[id]
 * Example: /replays/epic-match-123
 */
export function buildReplayUrl(slug: string, id: number): string {
  return `/replays/${slug}-${id}`;
}

/**
 * Parse replay ID from URL path
 * Example: "epic-match-123" → 123
 * Handles edge cases:
 * - "123" → 123
 * - "match-with-multiple-hyphens-456" → 456
 * - "invalid" → null
 */
export function parseReplayIdFromSlug(slugWithId: string): number | null {
  const parts = slugWithId.split('-');
  const lastPart = parts[parts.length - 1];
  const id = parseInt(lastPart, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}
