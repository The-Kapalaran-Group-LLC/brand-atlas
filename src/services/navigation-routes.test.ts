import { describe, expect, it } from 'vitest';
import { isBrandNavigatorRoute, resolveRootView } from './navigation-routes';

describe('navigation-routes', () => {
  it('detects lowercase brand navigator pathname', () => {
    expect(isBrandNavigatorRoute('/brand-navigator', '')).toBe(true);
  });

  it('detects camelcase BrandNavigator pathname', () => {
    expect(isBrandNavigatorRoute('/BrandNavigator', '')).toBe(true);
  });

  it('detects hash variants for brand navigator', () => {
    expect(isBrandNavigatorRoute('/', '#brand-navigator')).toBe(true);
    expect(isBrandNavigatorRoute('/', '#BrandNavigator')).toBe(true);
  });

  it('resolves root view to brand navigator for direct BrandNavigator path', () => {
    expect(resolveRootView('/BrandNavigator', '')).toBe('brand-navigator');
  });

  it('resolves root view to brand navigator when hash points to brand navigator from any path', () => {
    expect(resolveRootView('/visual-design-excavator', '#brand-navigator')).toBe('brand-navigator');
  });

  it('resolves root view to app when hash points to app routes even on brand navigator path', () => {
    expect(resolveRootView('/brand-navigator', '#cultural-archaeologist')).toBe('app');
    expect(resolveRootView('/brand-navigator', '#design-excavator')).toBe('app');
  });
});
