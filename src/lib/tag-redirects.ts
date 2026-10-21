/**
 * Tag pages that duplicate a real article get folded into that article.
 *
 * Two kinds of /tags/<slug>/ page compete with an article for the same query
 * instead of helping it:
 *   1. The tag names an article: /tags/gilgamesh/ next to /units/gilgamesh/.
 *   2. Only one article carries the tag: the page is a single card pointing
 *      at that article.
 * 2026-10-21 animemysterious: 76 tag pages were over half the sitemap; Google
 * crawled them first and ranked /tags/gilgamesh/ (#4, the site's top page)
 * while /units/gilgamesh/ stayed "URL is unknown to Google". Those tags now
 * 301 to the article (astro.config writes dist/_redirects), are not built,
 * and every chip links straight to the article. Tags with 2+ articles are
 * real hubs and stay (drilltoearthscore's /tags/chests/ etc. earn clicks).
 *
 * Deliberately IMPORT-FREE: astro.config.ts loads it at config time, before
 * the `~` alias exists (same constraint as lib/fallback-paths.ts). slugifyTag
 * lives here for that reason; lib/url.ts re-exports it.
 */

/**
 * Tag display string → URL slug.
 *
 * ASCII-safe tags ("Boss Guide" → "boss-guide") get the slugified form.
 * Anything that still contains a character outside [a-z0-9-] AFTER folding
 * takes the raw path wholesale — a partial ASCII strip would COLLAPSE
 * distinct tags onto one /tags/ page ('Roblox 焰牙' and 'Roblox 攻略' both
 * strip to 'roblox-'; '焰牙 攻略' strips to just '-').
 */
export function slugifyTag(tag: string): string {
  const folded = tag
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  // Raw path (CJK etc.): Astro writes params to disk verbatim, so a
  // percent-encoded value here becomes a literal '%E7...' directory that
  // only serves at the double-encoded URL, while every in-page link points
  // at the single-encoded form (404). The raw tag builds a raw-named
  // directory that both URL forms resolve to. Returning tag.trim() — never
  // the folded husk — keeps distinct non-ASCII tags distinct and the
  // function idempotent. (Only a blank tag can still yield '' here; the
  // route-level `if (slug)` guards skip it.)
  if (/[^a-z0-9-]/.test(folded)) return tag.trim();
  return folded;
}

export interface TagSourceEntry {
  locale: string;
  category: string;
  slug: string;
  tags: string[];
}

export interface TagTarget {
  category: string;
  slug: string;
}

/**
 * locale → (tag slug → article it folds into). Only published entries go in.
 * Same-name article wins over the single-carrier rule; among several
 * same-name articles, the one carrying the tag, then category order (sorted).
 */
export function computeTagRedirects(entries: TagSourceEntry[]): Map<string, Map<string, TagTarget>> {
  const out = new Map<string, Map<string, TagTarget>>();
  const byLocale = new Map<string, TagSourceEntry[]>();
  for (const e of entries) {
    if (!byLocale.has(e.locale)) byLocale.set(e.locale, []);
    byLocale.get(e.locale)!.push(e);
  }
  for (const [locale, list] of byLocale) {
    const sorted = [...list].sort((a, b) => `${a.category}/${a.slug}`.localeCompare(`${b.category}/${b.slug}`, 'en'));
    const carriers = new Map<string, TagSourceEntry[]>();
    for (const e of sorted) {
      for (const slug of new Set(e.tags.map(slugifyTag).filter(Boolean))) {
        if (!carriers.has(slug)) carriers.set(slug, []);
        carriers.get(slug)!.push(e);
      }
    }
    const map = new Map<string, TagTarget>();
    for (const [tagSlug, carrying] of carriers) {
      const named = sorted.filter((e) => e.slug === tagSlug);
      const target =
        named.find((e) => carrying.includes(e)) ?? named[0] ?? (carrying.length === 1 ? carrying[0] : undefined);
      if (target) map.set(tagSlug, { category: target.category, slug: target.slug });
    }
    out.set(locale, map);
  }
  return out;
}

/**
 * Cloudflare `_redirects` lines (both slash forms) for the folded tags.
 * Paths mirror lib/url's localizePath: default locale unprefixed, trailing
 * slash on the target.
 */
export function tagRedirectLines(redirects: Map<string, Map<string, TagTarget>>, defaultLocale: string): string[] {
  const lines: string[] = [];
  for (const [locale, map] of [...redirects].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const prefix = locale === defaultLocale ? '' : `/${locale}`;
    for (const [tagSlug, t] of [...map].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const from = encodeURI(`${prefix}/tags/${tagSlug}`);
      const to = encodeURI(`${prefix}/${t.category}/${t.slug}/`);
      lines.push(`${from} ${to} 301`, `${from}/ ${to} 301`);
    }
  }
  return lines;
}
