import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_AUDIENCE_HISTORY_MODES,
  clearAudienceHistory,
  getAudienceHistory,
  saveAudienceHistoryEntry,
} from './audience-history';

describe('audience-history', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns an empty list when no audiences are saved for an IP', () => {
    expect(getAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1')).toEqual([]);
  });

  it('saves and returns audiences scoped to the provided IP bucket', () => {
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1', 'Gen Z sneaker culture');
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '10.0.0.2', 'Millennial home buyers');

    expect(getAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1')).toEqual([
      'Gen Z sneaker culture',
    ]);
    expect(getAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '10.0.0.2')).toEqual([
      'Millennial home buyers',
    ]);
  });

  it('moves duplicate audiences to the front for the same IP bucket', () => {
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1', 'Gen Z sneaker culture');
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1', 'Millennial home buyers');
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1', 'gen z sneaker culture');

    expect(getAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1')).toEqual([
      'gen z sneaker culture',
      'Millennial home buyers',
    ]);
  });

  it('clears history only for the provided IP bucket when requested', () => {
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1', 'Gen Z sneaker culture');
    saveAudienceHistoryEntry(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '10.0.0.2', 'Millennial home buyers');

    clearAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1');

    expect(getAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '127.0.0.1')).toEqual([]);
    expect(getAudienceHistory(APP_AUDIENCE_HISTORY_MODES.CULTURAL_ARCHAEOLOGIST, '10.0.0.2')).toEqual([
      'Millennial home buyers',
    ]);
  });
});
