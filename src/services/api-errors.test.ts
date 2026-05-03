import { describe, expect, it } from 'vitest';
import { normalizeAppError } from './api-errors';

describe('normalizeAppError', () => {
  it('maps quota style failures', () => {
    const normalized = normalizeAppError(new Error('429 RESOURCE_EXHAUSTED'));
    expect(normalized.kind).toBe('quota');
    expect(normalized.isRecoverable).toBe(true);
  });

  it('maps network style failures', () => {
    const normalized = normalizeAppError(new Error('Failed to fetch'));
    expect(normalized.kind).toBe('network');
    expect(normalized.message).toMatch(/network issue/i);
  });

  it('maps validation style failures', () => {
    const normalized = normalizeAppError(new Error('Missing required fields'));
    expect(normalized.kind).toBe('validation');
  });

  it('falls back to unknown for uncategorized failures', () => {
    const normalized = normalizeAppError(new Error('Totally unexpected'));
    expect(normalized.kind).toBe('unknown');
  });
});

