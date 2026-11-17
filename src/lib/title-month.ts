/**
 * `{month}` placeholder for wiki frontmatter → "November 2026".
 *
 * Why: titles like "X Codes (October 2026)" used to be typed by hand. The
 * auto-updater bumps `lastModified` when it re-checks a page but is not
 * allowed to rewrite titles, so on 2026-11-17 five pages across our sites
 * still said "(October 2026)" while their data was checked that week.
 *
 * Write `title: 'X Codes ({month}) — 7 Working Codes'` instead. The month is
 * taken from the page's own `lastModified` (falls back to `date`), so the
 * title only moves forward when someone actually re-checks the page — a stale
 * page keeps its old month and the daily hygiene check names it.
 *
 * Applied to title / description / summary / faq in content.config.ts, so
 * every consumer (H1, <title>, OG, JSON-LD, lists, RSS, llms.txt) sees the
 * resolved string.
 */
export const MONTH_TOKEN = '{month}';

export function monthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

type Fillable = {
  title: string;
  description: string;
  summary?: string;
  date: Date;
  lastModified?: Date;
  faq?: { question: string; answer: string }[];
};

export function fillMonth<T extends Fillable>(data: T): T {
  const month = monthYear(data.lastModified ?? data.date);
  const f = (s: string) => s.replaceAll(MONTH_TOKEN, month);
  return {
    ...data,
    title: f(data.title),
    description: f(data.description),
    ...(data.summary !== undefined && { summary: f(data.summary) }),
    ...(data.faq && { faq: data.faq.map((q) => ({ question: f(q.question), answer: f(q.answer) })) }),
  };
}
