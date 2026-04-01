import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  Building2,
  Crosshair,
  Users,
  Plus,
  Trash2,
  Lightbulb,
  Type,
  Palette,
  ImageIcon,
  Sparkles,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { BrandColorSpec, BrandDeepDiveReport, generateBrandDeepDive, suggestBrandWebsite } from '../services/azure-openai';

interface BrandDeepDivePageProps {
  onBack: () => void;
}

export function BrandDeepDivePage({ onBack }: BrandDeepDivePageProps) {
  const [brands, setBrands] = useState([
    { id: 'brand-1', name: '', website: '' },
    { id: 'brand-2', name: '', website: '' },
  ]);
  const [analysisObjective, setAnalysisObjective] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [timeHorizon, setTimeHorizon] = useState('6-12 months');
  const [showValidation, setShowValidation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BrandDeepDiveReport | null>(null);
  const websiteLookupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);

    const normalizedBrands = brands
      .map((brand) => ({
        name: brand.name.trim(),
        website: brand.website.trim(),
      }))
      .filter((brand) => brand.name.length > 0)
      .slice(0, 6);

    if (normalizedBrands.length === 0 || !analysisObjective.trim()) {
      setError('Please add at least one brand and a visual identity objective.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateBrandDeepDive({
        brands: normalizedBrands,
        analysisObjective,
        targetAudience,
        timeHorizon,
      });
      setReport(result);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to generate brand deep dive: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const canAddBrand = brands.length < 6;
  const brandCount = brands.filter((brand) => brand.name.trim()).length;

  const addBrandRow = () => {
    if (!canAddBrand) return;
    const nextId = `brand-${Date.now()}`;
    setBrands((prev) => [...prev, { id: nextId, name: '', website: '' }]);
  };

  const removeBrandRow = (id: string) => {
    setBrands((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((brand) => brand.id !== id);
    });
  };

  const updateBrandRow = (id: string, key: 'name' | 'website', value: string) => {
    setBrands((prev) => prev.map((brand) => (brand.id === id ? { ...brand, [key]: value } : brand)));
  };

  const renderColorSwatch = (color: BrandColorSpec) => {
    const normalizedHex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
    return (
      <li key={`${color.name}-${color.hex}`} className="rounded-xl border border-zinc-200 p-3 bg-white">
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-lg border border-zinc-200"
            style={{ backgroundColor: normalizedHex }}
            aria-label={`${color.name} swatch`}
          />
          <div>
            <p className="text-sm font-medium text-zinc-900">{color.name}</p>
            <p className="text-xs text-zinc-500">HEX {color.hex}</p>
          </div>
        </div>
        {(color.rgb || color.cmyk || color.pantone || color.usage) && (
          <div className="mt-2 text-xs text-zinc-500 space-y-1">
            {color.rgb && <p>RGB: {color.rgb}</p>}
            {color.cmyk && <p>CMYK: {color.cmyk}</p>}
            {color.pantone && <p>Pantone: {color.pantone}</p>}
            {color.usage && <p>Usage: {color.usage}</p>}
          </div>
        )}
      </li>
    );
  };

  useEffect(() => {
    const activeBrandIds = new Set(brands.map((brand) => brand.id));

    Object.keys(websiteLookupTimersRef.current).forEach((id) => {
      if (!activeBrandIds.has(id)) {
        clearTimeout(websiteLookupTimersRef.current[id]);
        delete websiteLookupTimersRef.current[id];
      }
    });

    brands.forEach((brand) => {
      const hasName = brand.name.trim().length >= 2;
      const hasWebsite = brand.website.trim().length > 0;

      if (!hasName || hasWebsite) {
        if (websiteLookupTimersRef.current[brand.id]) {
          clearTimeout(websiteLookupTimersRef.current[brand.id]);
          delete websiteLookupTimersRef.current[brand.id];
        }
        return;
      }

      if (websiteLookupTimersRef.current[brand.id]) {
        return;
      }

      websiteLookupTimersRef.current[brand.id] = setTimeout(async () => {
        try {
          const suggestedWebsite = await suggestBrandWebsite(brand.name);
          if (!suggestedWebsite) return;

          setBrands((prev) =>
            prev.map((current) => {
              if (current.id !== brand.id) return current;

              if (current.website.trim()) {
                return current;
              }

              if (current.name.trim().toLowerCase() !== brand.name.trim().toLowerCase()) {
                return current;
              }

              return { ...current, website: suggestedWebsite };
            })
          );
        } finally {
          clearTimeout(websiteLookupTimersRef.current[brand.id]);
          delete websiteLookupTimersRef.current[brand.id];
        }
      }, 700);
    });

    return () => {
      Object.keys(websiteLookupTimersRef.current).forEach((id) => {
        clearTimeout(websiteLookupTimersRef.current[id]);
        delete websiteLookupTimersRef.current[id];
      });
    };
  }, [brands]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/90 border border-zinc-200 text-zinc-700 rounded-full hover:bg-zinc-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Options
        </button>
        <div className="text-right">
          <h2 className="text-2xl md:text-3xl font-semibold text-zinc-900">Brand Deep Dive</h2>
          <p className="text-zinc-500 text-sm">Visual identity system analysis across up to 6 brands</p>
        </div>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 md:p-8 space-y-4"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Brands To Analyze</h3>
            <span className="text-xs text-zinc-400">{brandCount}/6 filled</span>
          </div>

          <div className="space-y-3">
            {brands.map((brand, idx) => (
              <div key={brand.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={brand.name}
                    onChange={(e) => updateBrandRow(brand.id, 'name', e.target.value)}
                    placeholder={`Brand ${idx + 1} Name`}
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    disabled={isLoading}
                  />
                </div>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={brand.website}
                    onChange={(e) => updateBrandRow(brand.id, 'website', e.target.value)}
                    placeholder="Website URL (optional)"
                    className="w-full pl-12 pr-4 py-3 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeBrandRow(brand.id)}
                  className="px-3 py-3 rounded-2xl border border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                  disabled={isLoading || brands.length === 1}
                  aria-label={`Remove brand ${idx + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={addBrandRow}
              disabled={!canAddBrand || isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add Brand
            </button>
          </div>
          {showValidation && brandCount === 0 && (
            <p className="text-sm text-red-500 mt-2">Add at least one brand name.</p>
          )}
          {showValidation && !analysisObjective.trim() && (
            <p className="text-sm text-red-500 mt-2">Add a visual identity objective.</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative md:col-span-2">
            <Crosshair className="absolute left-4 top-4 w-5 h-5 text-zinc-400" />
            <textarea
              value={analysisObjective}
              onChange={(e) => setAnalysisObjective(e.target.value)}
              placeholder="Visual Identity Objective (Required) e.g. Compare distinctiveness and consistency across premium skincare brands"
              rows={3}
              className={`w-full pl-12 pr-4 py-4 rounded-2xl border ${showValidation && !analysisObjective.trim() ? 'border-red-500' : 'border-zinc-200'} focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none`}
              disabled={isLoading}
            />
          </div>

          <div className="relative">
            <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Target Audience (Optional)"
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              disabled={isLoading}
            />
          </div>

        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between pt-2">
          <select
            value={timeHorizon}
            onChange={(e) => setTimeHorizon(e.target.value)}
            className="px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            disabled={isLoading}
          >
            <option value="0-6 months">0-6 months</option>
            <option value="6-12 months">6-12 months</option>
            <option value="12-24 months">12-24 months</option>
            <option value="24+ months">24+ months</option>
          </select>

          <button
            type="submit"
            disabled={isLoading}
            className="px-8 py-3 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Auditing Brand Systems...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Visual Identity Deep Dive
              </>
            )}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </motion.form>

      <AnimatePresence mode="wait">
        {report && (
          <motion.div
            key="brand-deep-dive-report"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">Analysis Objective</h3>
              <p className="text-zinc-700 leading-relaxed text-sm">{report.analysisObjective}</p>
              <p className="text-zinc-500 leading-relaxed text-sm mt-3">{report.ecosystemMethod}</p>
            </section>

            {report.brandProfiles.map((profile) => (
              <section key={profile.brandName} className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-900">{profile.brandName}</h3>
                    {profile.website && <p className="text-sm text-zinc-500">{profile.website}</p>}
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p className="font-medium">Consistency</p>
                    <p>{profile.consistencyAssessment}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">Logo System</h4>
                    <p className="text-sm text-zinc-700 mb-2"><span className="font-medium">Primary:</span> {profile.logo.mainLogo}</p>
                    <p className="text-sm text-zinc-700 mb-2"><span className="font-medium">Wordmark:</span> {profile.logo.wordmarkLogotype}</p>
                    <p className="text-sm text-zinc-700 mb-1 font-medium">Variations</p>
                    <ul className="space-y-1">
                      {profile.logo.logoVariations.map((item, idx) => (
                        <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                      ))}
                    </ul>
                    <p className="text-sm text-zinc-700 mt-3 mb-1 font-medium">Symbols / Icons</p>
                    <ul className="space-y-1">
                      {profile.logo.symbolsIcons.map((item, idx) => (
                        <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3 inline-flex items-center gap-2">
                      <Type className="w-4 h-4" /> Typography
                    </h4>
                    <p className="text-sm text-zinc-700 mb-2"><span className="font-medium">Families:</span> {profile.typography.fontFamilies.join(', ')}</p>
                    <p className="text-sm text-zinc-700"><span className="font-medium">H1:</span> {profile.typography.hierarchy.h1}</p>
                    <p className="text-sm text-zinc-700"><span className="font-medium">H2:</span> {profile.typography.hierarchy.h2}</p>
                    <p className="text-sm text-zinc-700 mb-2"><span className="font-medium">Body:</span> {profile.typography.hierarchy.body}</p>
                    <p className="text-sm text-zinc-700 mb-1 font-medium">Usage Rules</p>
                    <ul className="space-y-1">
                      {profile.typography.usageRules.map((item, idx) => (
                        <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3 inline-flex items-center gap-2">
                      <Palette className="w-4 h-4" /> Primary Colors
                    </h4>
                    <ul className="space-y-2">{profile.colorPalette.primaryColors.map(renderColorSwatch)}</ul>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">Accent Colors</h4>
                    <ul className="space-y-2">{profile.colorPalette.secondaryAccentColors.map(renderColorSwatch)}</ul>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">Neutrals</h4>
                    <ul className="space-y-2">{profile.colorPalette.neutrals.map(renderColorSwatch)}</ul>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3 inline-flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Supporting Visual Elements
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 mb-1">Imagery Style</p>
                      <ul className="space-y-1">{profile.supportingVisualElements.imageryStyle.map((item, idx) => <li key={idx} className="text-sm text-zinc-700">• {item}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800 mb-1">Icons</p>
                      <ul className="space-y-1">{profile.supportingVisualElements.icons.map((item, idx) => <li key={idx} className="text-sm text-zinc-700">• {item}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800 mb-1">Patterns & Textures</p>
                      <ul className="space-y-1">{profile.supportingVisualElements.patternsTextures.map((item, idx) => <li key={idx} className="text-sm text-zinc-700">• {item}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800 mb-1">Shapes</p>
                      <ul className="space-y-1">{profile.supportingVisualElements.shapes.map((item, idx) => <li key={idx} className="text-sm text-zinc-700">• {item}</li>)}</ul>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium text-zinc-800 mb-1">Data Visualization</p>
                      <ul className="space-y-1">{profile.supportingVisualElements.dataVisualization.map((item, idx) => <li key={idx} className="text-sm text-zinc-700">• {item}</li>)}</ul>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">Distinctiveness</h4>
                    <p className="text-sm text-zinc-700">{profile.distinctivenessAssessment}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">Per-Brand Sources</h4>
                    <div className="flex flex-wrap gap-2">
                      {profile.sources.map((source, idx) => (
                        <a
                          key={`${profile.brandName}-${idx}`}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs bg-zinc-50 border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-3 py-1.5 rounded-full"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate max-w-[180px]">{source.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}

            <section className="bg-white rounded-3xl border border-zinc-200 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 mb-3">Opportunity Spaces</h3>
              <ul className="space-y-2">
                {report.crossBrandReadout.map((item, idx) => (
                  <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                ))}
              </ul>
            </section>

            <section className="bg-white rounded-3xl border border-zinc-200 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 mb-3 inline-flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                Strategic Recommendations
              </h3>
              <ul className="space-y-2">
                {report.strategicRecommendations.map((item, idx) => (
                  <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                ))}
              </ul>
            </section>

            {report.sources.length > 0 && (
              <section className="lg:col-span-2 bg-zinc-50 rounded-3xl border border-zinc-200 p-6">
                <h3 className="text-base font-semibold text-zinc-900 mb-3">Global Sources</h3>
                <div className="flex flex-wrap gap-2">
                  {report.sources.map((source, idx) => (
                    <a
                      key={idx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 px-3 py-1.5 rounded-full"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate max-w-[220px]">{source.title}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}