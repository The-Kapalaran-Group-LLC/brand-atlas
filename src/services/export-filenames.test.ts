import { describe, expect, it } from 'vitest';
import { buildExportFileBase } from './export-filenames';

describe('buildExportFileBase', () => {
  it('falls back when audience is emptyish', () => {
    expect(buildExportFileBase(undefined, 'Brand_Navigator')).toBe('Brand_Navigator');
    expect(buildExportFileBase(null, 'Brand_Navigator')).toBe('Brand_Navigator');
    expect(buildExportFileBase('', 'Brand_Navigator')).toBe('Brand_Navigator');
    expect(buildExportFileBase('   ', 'Brand_Navigator')).toBe('Brand_Navigator');
  });

  it('sanitizes and underscores a valid audience value', () => {
    expect(buildExportFileBase('Gen Z / Sneakerheads', 'Brand_Navigator')).toBe('Gen_Z_Sneakerheads');
  });
});
