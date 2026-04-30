import { describe, expect, it } from 'vitest';
import { normalizeExternalHttpUrl, sanitizeApiBaseUrl } from './external-links';

describe('normalizeExternalHttpUrl', () => {
  it('adds https protocol for bare domains', () => {
    expect(normalizeExternalHttpUrl('example.com/path')).toBe('https://example.com/path');
  });

  it('returns null for unsupported schemes', () => {
    expect(normalizeExternalHttpUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalHttpUrl('ftp://example.com')).toBeNull();
  });

  it('blocks localhost links when app is not running on localhost', () => {
    expect(
      normalizeExternalHttpUrl('http://localhost:3000/foo', {
        currentHostname: 'brandatlas.app',
      })
    ).toBeNull();
  });

  it('allows localhost links when app is running on localhost', () => {
    expect(
      normalizeExternalHttpUrl('http://localhost:3000/foo', {
        currentHostname: 'localhost',
      })
    ).toBe('http://localhost:3000/foo');
  });
});

describe('sanitizeApiBaseUrl', () => {
  it('keeps safe remote API bases', () => {
    expect(sanitizeApiBaseUrl('https://api.brandatlas.app/')).toBe('https://api.brandatlas.app');
  });

  it('drops localhost API base in deployed browsers', () => {
    expect(
      sanitizeApiBaseUrl('http://localhost:3001', {
        currentHostname: 'brandatlas.app',
      })
    ).toBe('');
  });

  it('keeps localhost API base for localhost development', () => {
    expect(
      sanitizeApiBaseUrl('http://localhost:3001', {
        currentHostname: '127.0.0.1',
      })
    ).toBe('http://localhost:3001');
  });
});
