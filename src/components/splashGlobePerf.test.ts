import { describe, expect, it } from 'vitest';
import {
  getFrameDeltaMs,
  getInertiaDamping,
  getNextQualityStep,
  getRenderStride,
  getStripeClusterDensity,
  MAX_QUALITY_STEP,
} from './splashGlobePerf';

describe('splashGlobePerf', () => {
  it('clamps frame delta into a stable render window', () => {
    expect(getFrameDeltaMs(-1)).toBeCloseTo(16.67, 2);
    expect(getFrameDeltaMs(2)).toBe(8);
    expect(getFrameDeltaMs(90)).toBe(40);
  });

  it('ramps quality down under frame pressure and up when fast', () => {
    expect(getNextQualityStep(0, 45)).toBe(2);
    expect(getNextQualityStep(2, 30)).toBe(3);
    expect(getNextQualityStep(4, 12)).toBe(3);
    expect(getNextQualityStep(MAX_QUALITY_STEP, 45)).toBe(MAX_QUALITY_STEP);
  });

  it('increases draw stride as quality step rises', () => {
    expect(getRenderStride(0, 'countryFill')).toBe(1);
    expect(getRenderStride(3, 'countryFill')).toBe(4);
    expect(getRenderStride(3, 'countryOutline')).toBe(3);
    expect(getRenderStride(4, 'ocean')).toBe(3);
  });

  it('applies stronger damping for longer frames', () => {
    const fastFrame = getInertiaDamping(10);
    const slowFrame = getInertiaDamping(32);

    expect(slowFrame).toBeLessThan(fastFrame);
    expect(fastFrame).toBeLessThan(1);
  });

  it('returns stable clustered densities in [0,1] with meaningful spread', () => {
    const a = getStripeClusterDensity(35, -75);
    const b = getStripeClusterDensity(35, -75);
    const c = getStripeClusterDensity(-12, 115);

    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
    expect(a).toBe(b);
    expect(Math.abs(a - c)).toBeGreaterThan(0.05);
  });
});
