import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RECENT_RESULTS_MODES,
  clearRecentResults,
  getRecentResults,
  replaceRecentResults,
  removeRecentResult,
  saveRecentResult,
} from './recent-results-storage';

type MockResult = {
  id: string;
  title: string;
  description: string;
  extra?: string;
};

describe('recent-results-storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns empty array when mode has no records', () => {
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toEqual([]);
  });

  it('keeps data siloed by app mode', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'brand-1',
      title: 'Brand One',
      description: 'Brand result',
    });

    saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: 'design-1',
      title: 'Design One',
      description: 'Design result',
    });

    const brandResults = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR);
    const designResults = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR);

    expect(brandResults).toHaveLength(1);
    expect(designResults).toHaveLength(1);
    expect(brandResults[0]?.id).toBe('brand-1');
    expect(designResults[0]?.id).toBe('design-1');
  });

  it('moves duplicate item to the front instead of duplicating', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'a',
      title: 'A',
      description: 'First',
    });
    saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'b',
      title: 'B',
      description: 'Second',
    });

    saveRecentResult(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'a',
      title: 'A Updated',
      description: 'Re-opened',
      extra: 'kept object payload',
    });

    const results = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: 'a',
      title: 'A Updated',
      description: 'Re-opened',
      extra: 'kept object payload',
    });
    expect(results[1]?.id).toBe('b');
  });

  it('stores all recent history entries without a cap', () => {
    const totalEntries = 25;

    for (let i = 0; i < totalEntries; i += 1) {
      saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
        id: `id-${i}`,
        title: `Title ${i}`,
        description: `Description ${i}`,
      });
    }

    const results = getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR);

    expect(results).toHaveLength(totalEntries);
    expect(results[0]?.id).toBe(`id-${totalEntries - 1}`);
    expect(results[totalEntries - 1]?.id).toBe('id-0');
  });

  it('clears history for a single mode', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'brand-1',
      title: 'Brand One',
      description: 'Brand result',
    });
    saveRecentResult(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: 'design-1',
      title: 'Design One',
      description: 'Design result',
    });

    clearRecentResults(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR);

    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toEqual([]);
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR)).toHaveLength(1);
  });

  it('removes an individual recent result by id', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'brand-1',
      title: 'Brand One',
      description: 'Brand result',
    });
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'brand-2',
      title: 'Brand Two',
      description: 'Brand result',
    });

    const next = removeRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, 'brand-1');

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('brand-2');
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toHaveLength(1);
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)[0]?.id).toBe('brand-2');
  });

  it('returns empty array if stored JSON is invalid', () => {
    const parseSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, '{invalid_json');

    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)).toEqual([]);
    expect(parseSpy).toHaveBeenCalled();
  });

  it('replaces recent results while preserving provided order', () => {
    saveRecentResult(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'older',
      title: 'Older',
      description: 'Older item',
    });

    const replaced = replaceRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, [
      { id: 'first', title: 'First', description: 'First item' },
      { id: 'second', title: 'Second', description: 'Second item' },
    ]);

    expect(replaced).toHaveLength(2);
    expect(replaced[0]?.id).toBe('first');
    expect(replaced[1]?.id).toBe('second');
    expect(getRecentResults<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR)[0]?.id).toBe('first');
  });
});
