import { describe, it, expect } from 'vitest';
import { computeTagRedirects, tagRedirectLines, type TagSourceEntry } from '~/lib/tag-redirects';

const e = (category: string, slug: string, tags: string[], locale = 'en'): TagSourceEntry => ({ locale, category, slug, tags });

describe('computeTagRedirects', () => {
  const entries = [
    e('units', 'gilgamesh', ['Gilgamesh', 'Fate']),
    e('guides', 'best-teams', ['Gilgamesh', 'Teams']),
    e('guides', 'update-05', ['Fate', 'Update']),
    e('guides', 'pity', ['Pity']),
    e('guides', 'beginner', ['Update']),
  ];
  const en = computeTagRedirects(entries).get('en')!;

  it('folds a tag that names an article into that article, even with several carriers', () => {
    expect(en.get('gilgamesh')).toEqual({ category: 'units', slug: 'gilgamesh' });
  });
  it('folds a single-carrier tag into its only article', () => {
    expect(en.get('teams')).toEqual({ category: 'guides', slug: 'best-teams' });
    expect(en.get('pity')).toEqual({ category: 'guides', slug: 'pity' });
  });
  it('keeps multi-article hub tags', () => {
    expect(en.has('fate')).toBe(false);
    expect(en.has('update')).toBe(false);
  });
  it('is per-locale', () => {
    const m = computeTagRedirects([e('units', 'goku', ['Goku']), e('guides', 'a', ['Goku'], 'ja'), e('guides', 'b', ['Goku'], 'ja')]);
    expect(m.get('en')!.get('goku')).toEqual({ category: 'units', slug: 'goku' });
    expect(m.get('ja')!.has('goku')).toBe(false);
  });
});

describe('tagRedirectLines', () => {
  it('emits both slash forms, locale-prefixed outside the default locale', () => {
    const m = computeTagRedirects([e('units', 'goku', ['Goku']), e('units', 'goku', ['Goku'], 'ja')]);
    expect(tagRedirectLines(m, 'en')).toEqual([
      '/tags/goku /units/goku/ 301',
      '/tags/goku/ /units/goku/ 301',
      '/ja/tags/goku /ja/units/goku/ 301',
      '/ja/tags/goku/ /ja/units/goku/ 301',
    ]);
  });
});
