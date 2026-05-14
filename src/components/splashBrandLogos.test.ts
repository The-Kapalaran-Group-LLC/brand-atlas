import { describe, expect, it } from 'vitest';
import {
  CONTINENT_BRANDS,
  buildBrandLogoMarkers,
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
    expect(first).toHaveLength(90);

    for (const [continent, brands] of Object.entries(CONTINENT_BRANDS)) {
      const continentMarkers = first.filter((marker) => marker.continent === continent);
      expect(continentMarkers).toHaveLength(brands.length);
    }
  });

  it('keeps the generated marker fields populated', () => {
    const markers = buildBrandLogoMarkers(createCandidates(), 777);

    for (const marker of markers) {
      expect(marker.brand.length).toBeGreaterThan(0);
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
    expect(getBrandMonogram('LG Electronics')).toBe('LGE');
    expect(getBrandMonogram('Banco do Brasil')).toBe('BDB');
    expect(getBrandMonogram('Air New Zealand')).toBe('ANZ');
  });
});
