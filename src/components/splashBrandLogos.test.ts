import { describe, expect, it } from 'vitest';
import {
  BRAND_LOGO_DOMAINS,
  BRAND_TICKERS,
  CONTINENT_BRANDS,
  buildBrandLogoUrl,
  buildBrandLogoMarkers,
  getBrandAbbreviation,
  getDisplayTickerCopy,
  getBrandTicker,
  getBrandMonogram,
  type MarkerCandidatePoint,
} from './splashBrandLogos';

const createCandidates = (): MarkerCandidatePoint[] => {
  const points: MarkerCandidatePoint[] = [];
  for (let continentIndex = 0; continentIndex < 6; continentIndex += 1) {
    for (let i = 0; i < 30; i += 1) {
      points.push({
        lat: continentIndex * 10 + i * 0.1,
        lon: continentIndex * 20 + i * 0.1,
        variant: i,
        continentIndex,
      });
    }
  }
  return points;
};

describe('splashBrandLogos', () => {
  it('builds deterministic markers for all continents and brands', () => {
    const candidates = createCandidates();

    const first = buildBrandLogoMarkers(candidates, 12345);
    const second = buildBrandLogoMarkers(candidates, 12345);

    expect(first).toEqual(second);
    expect(first).toHaveLength(30);

    for (const [continent, brands] of Object.entries(CONTINENT_BRANDS)) {
      const continentMarkers = first.filter((marker) => marker.continent === continent);
      expect(continentMarkers).toHaveLength(brands.length);
    }
  });

  it('keeps the generated marker fields populated', () => {
    const markers = buildBrandLogoMarkers(createCandidates(), 777);

    for (const marker of markers) {
      expect(marker.brand.length).toBeGreaterThan(0);
      expect(marker.logoDomain.length).toBeGreaterThan(0);
      expect(marker.logoUrl).toContain(`https://logo.clearbit.com/${marker.logoDomain}`);
      expect(marker.ticker.length).toBeGreaterThan(0);
      expect(marker.wordmark.length).toBeGreaterThan(0);
      expect(marker.monogram.length).toBeGreaterThan(0);
      expect(marker.styleVariant).toBeGreaterThanOrEqual(0);
      expect(marker.styleVariant).toBeLessThan(7);
      expect(Number.isFinite(marker.lat)).toBe(true);
      expect(Number.isFinite(marker.lon)).toBe(true);
    }
  });

  it('builds readable monograms from complex brand names', () => {
    expect(getBrandMonogram("McDonald's")).toBe('MCD');
    expect(getBrandMonogram('LG Electronics')).toBe('LG');
    expect(getBrandMonogram('Banco do Brasil')).toBe('BDB');
    expect(getBrandMonogram('Air New Zealand')).toBe('ANZ');
  });

  it('has an official logo domain mapping for every listed brand', () => {
    const allBrands = Object.values(CONTINENT_BRANDS).flat();
    for (const brand of allBrands) {
      expect(BRAND_LOGO_DOMAINS[brand]).toBeTruthy();
      expect(buildBrandLogoUrl(brand)).toMatch(/^https:\/\/logo\.clearbit\.com\/.+\?size=256$/);
    }
  });

  it('has ticker copy mapping for every listed brand', () => {
    const allBrands = Object.values(CONTINENT_BRANDS).flat();
    for (const brand of allBrands) {
      expect(BRAND_TICKERS[brand]).toBeTruthy();
      expect(getBrandTicker(brand)).toBe(BRAND_TICKERS[brand]);
    }
    expect(getBrandTicker('Unknown Brand')).toBe('N/A');
  });

  it('uses brand abbreviation when ticker is PRIVATE, numeric, or dotted', () => {
    expect(getDisplayTickerCopy('IKEA')).toBe('IKEA');
    expect(getDisplayTickerCopy('TikTok')).toBe('TIKT');
    expect(getDisplayTickerCopy('Samsung')).toBe('SAMS');
    expect(getDisplayTickerCopy('Toyota')).toBe('TOYO');
    expect(getDisplayTickerCopy('Nestlé')).toBe('NESTL');
    expect(getDisplayTickerCopy('Nubank')).toBe('NU');
  });

  it('builds concise brand abbreviations', () => {
    expect(getBrandAbbreviation('Coca-Cola')).toBe('CC');
    expect(getBrandAbbreviation('LATAM Airlines')).toBe('LA');
    expect(getBrandAbbreviation('Woolworths')).toBe('WOOL');
  });

  it('never places North America markers over Canada or Alaska bands', () => {
    const markers = buildBrandLogoMarkers(createCandidates(), 42);
    const northAmerica = markers.filter((marker) => marker.continent === 'North America');
    expect(northAmerica).toHaveLength(5);

    for (const marker of northAmerica) {
      const inCanadaBand = marker.lat >= 49 && marker.lon >= -170 && marker.lon <= -52;
      const inAlaskaBand = marker.lat >= 52 && (marker.lon <= -128 || marker.lon >= 170);
      expect(inCanadaBand || inAlaskaBand).toBe(false);
    }
  });
});
