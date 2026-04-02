import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  Building2,
  Crosshair,
  Users,
  Clock,
  Plus,
  Trash2,
  Type,
  Palette,
  ImageIcon,
  Sparkles,
  RefreshCw,
  Search,
  ExternalLink,
  Download,
  Share2,
  Info,
} from 'lucide-react';
import pptxgen from 'pptxgenjs';
import { BrandColorSpec, BrandDeepDiveReport, generateBrandDeepDive, suggestBrandWebsite } from '../services/azure-openai';

interface BrandDeepDivePageProps {
  onBack: () => void;
}

type VisualMethod = 'ai' | 'deterministic' | 'screenshot';

interface BrandVisualCard {
  label: string;
  url: string;
}

interface BrandVisualSelection {
  method: VisualMethod;
  images: BrandVisualCard[];
  deterministicLogoUrl?: string;
}

interface SavedDeepDiveSearch {
  id: string;
  date: string;
  brands: Array<{ name: string; website?: string }>;
  analysisObjective: string;
  targetAudience: string;
  report: BrandDeepDiveReport;
}

type ResultTab = 'profiles' | 'compare';
type CompareElement = 'primaryColors' | 'accentColors' | 'neutrals' | 'typography' | 'imageryStyle';

const VISUAL_METHOD_LABEL: Record<VisualMethod, string> = {
  ai: 'AI-Provided Assets',
  deterministic: 'Derived Domain Logo',
  screenshot: 'Website Screenshot Previews',
};

const VISUAL_METHOD_PRIORITY: VisualMethod[] = ['ai', 'deterministic', 'screenshot'];

function normalizeHttpUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getDomainFromUrl(url?: string | null): string | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;

  try {
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

function buildDeterministicLogoUrl(website?: string | null): string | null {
  const domain = getDomainFromUrl(website);
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}`;
}

function buildFaviconLogoUrl(website?: string | null): string | null {
  const domain = getDomainFromUrl(website);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=256&domain=${domain}`;
}

function buildScreenshotPreviewUrl(pageUrl: string): string {
  return `https://image.thum.io/get/width/1920/noanimate/${pageUrl}`;
}

function buildWordpressScreenshotUrl(pageUrl: string): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=1920`;
}

function canonicalizeVisualUrl(rawUrl: string): string {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) return rawUrl;

  try {
    const parsed = new URL(normalized);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function isLogoLikeAsset(url: string, label: string): boolean {
  const value = `${url} ${label}`.toLowerCase();
  return (
    value.includes('logo') ||
    value.includes('favicon') ||
    value.includes('icon') ||
    value.includes('wordmark') ||
    value.includes('brand mark')
  );
}

function isLikelyLowFidelityVisual(url: string): boolean {
  const value = url.toLowerCase();
  return (
    value.includes('logo.clearbit.com') ||
    value.includes('google.com/s2/favicons') ||
    value.includes('favicon') ||
    value.includes('avatar') ||
    value.includes('gravatar')
  );
}

function scoreVisualMethod(method: VisualMethod, cards: BrandVisualCard[]): number {
  const uniqueDomains = new Set(cards.map((card) => getDomainFromUrl(card.url) || card.url)).size;
  const nonLogoCount = cards.filter((card) => !isLogoLikeAsset(card.url, card.label)).length;
  const lowFidelityCount = cards.filter((card) => isLikelyLowFidelityVisual(card.url)).length;
  const base = cards.length * 10 + uniqueDomains * 4 + nonLogoCount * 3 - lowFidelityCount * 6;

  const methodBonus = method === 'screenshot' ? 2 : method === 'ai' ? 1 : 0;
  return base + methodBonus;
}

function dedupeVisualCards(cards: BrandVisualCard[]): BrandVisualCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const canonical = canonicalizeVisualUrl(card.url);
    if (seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
}

export function BrandDeepDivePage({ onBack }: BrandDeepDivePageProps) {
  const isDevMode =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const [brands, setBrands] = useState([
    { id: 'brand-1', name: '', website: '' },
    { id: 'brand-2', name: '', website: '' },
  ]);
  const [analysisObjective, setAnalysisObjective] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [resultTab, setResultTab] = useState<ResultTab>('profiles');
  const [compareElement, setCompareElement] = useState<CompareElement>('primaryColors');
  const [compareDropdownOpen, setCompareDropdownOpen] = useState(false);
  const [selectedElementToCompare, setSelectedElementToCompare] = useState<CompareElement | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BrandDeepDiveReport | null>(null);
  const [bestVisualsByBrand, setBestVisualsByBrand] = useState<Record<string, BrandVisualSelection>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedDeepDiveSearch[]>([]);
  const websiteLookupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const undoDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentlyDeletedSearch, setRecentlyDeletedSearch] = useState<SavedDeepDiveSearch | null>(null);
  const [undoToast, setUndoToast] = useState<{ message: string } | null>(null);

  const clearDeepDiveSearch = () => {
    setBrands([
      { id: 'brand-1', name: '', website: '' },
      { id: 'brand-2', name: '', website: '' },
    ]);
    setAnalysisObjective('');
    setTargetAudience('');
    setResultTab('profiles');
    setCompareElement('primaryColors');
    setShowValidation(false);
    setError(null);
    setReport(null);
    setBestVisualsByBrand({});
    setToast('Started a new search.');
  };

  const loadSavedSearch = (saved: SavedDeepDiveSearch) => {
    const loadedBrands = saved.brands.slice(0, 6).map((brand, idx) => ({
      id: `brand-loaded-${Date.now()}-${idx}`,
      name: brand.name,
      website: brand.website || '',
    }));
    setBrands(loadedBrands.length > 0 ? loadedBrands : [{ id: 'brand-1', name: '', website: '' }]);
    setAnalysisObjective(saved.analysisObjective || '');
    setTargetAudience(saved.targetAudience || '');
    setReport(saved.report);
    setResultTab('profiles');
    setShowValidation(false);
    setError(null);
    setToast('Loaded saved search.');
  };

  const deleteSavedSearch = (id: string) => {
    const deleted = savedSearches.find((item) => item.id === id);
    if (!deleted) return;

    const updated = savedSearches.filter((item) => item.id !== id);
    setSavedSearches(updated);
    localStorage.setItem('visual_design_deep_dives', JSON.stringify(updated));

    if (undoDeleteTimeoutRef.current) {
      clearTimeout(undoDeleteTimeoutRef.current);
      undoDeleteTimeoutRef.current = null;
    }

    setRecentlyDeletedSearch(deleted);
    setToast('Saved project deleted.');
    setUndoToast({ message: `${deleted.brands.map((b) => b.name).join(' vs ')} deleted` });
    undoDeleteTimeoutRef.current = setTimeout(() => {
      setRecentlyDeletedSearch(null);
      setUndoToast(null);
      undoDeleteTimeoutRef.current = null;
    }, 8000);
  };

  const undoDeleteSavedSearch = () => {
    if (!recentlyDeletedSearch) return;

    if (undoDeleteTimeoutRef.current) {
      clearTimeout(undoDeleteTimeoutRef.current);
      undoDeleteTimeoutRef.current = null;
    }

    const updated = [recentlyDeletedSearch, ...savedSearches.filter((item) => item.id !== recentlyDeletedSearch.id)];
    setSavedSearches(updated);
    localStorage.setItem('visual_design_deep_dives', JSON.stringify(updated));
    setRecentlyDeletedSearch(null);
    setUndoToast(null);
    setToast('Deletion undone.');
  };

  useEffect(() => {
    const raw = localStorage.getItem('visual_design_deep_dives');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedDeepDiveSearch[];
      if (Array.isArray(parsed)) {
        setSavedSearches(parsed);
      }
    } catch {
      setSavedSearches([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (undoDeleteTimeoutRef.current) {
        clearTimeout(undoDeleteTimeoutRef.current);
        undoDeleteTimeoutRef.current = null;
      }
    };
  }, []);

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

    if (normalizedBrands.length === 0) {
      setError('Please add at least one brand.');
      return;
    }

    setFakeProgress(5);
    setIsLoading(true);
    setError(null);
    setResultTab('profiles');
    setBestVisualsByBrand({});

    try {
      const result = await generateBrandDeepDive({
        brands: normalizedBrands,
        analysisObjective,
        targetAudience,
      });
      setReport(result);

      const nextSaved: SavedDeepDiveSearch = {
        id: `deep-dive-${Date.now()}`,
        date: new Date().toISOString(),
        brands: normalizedBrands,
        analysisObjective,
        targetAudience,
        report: result,
      };
      const updated = [nextSaved, ...savedSearches.filter((item) => item.id !== nextSaved.id)].slice(0, 20);
      setSavedSearches(updated);
      localStorage.setItem('visual_design_deep_dives', JSON.stringify(updated));
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to generate brand deep dive: ${message}`);
    } finally {
      setFakeProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
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

  const renderComparePanel = () => {
    if (!report) return null;

    if (compareElement === 'primaryColors' || compareElement === 'accentColors' || compareElement === 'neutrals') {
      const titleMap: Record<CompareElement, string> = {
        primaryColors: 'Primary Colors Comparison',
        accentColors: 'Accent Colors Comparison',
        neutrals: 'Neutral Colors Comparison',
        typography: 'Typography Comparison',
        imageryStyle: 'Imagery Style Comparison',
      };

      return (
        <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">{titleMap[compareElement]}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.brandProfiles.map((profile) => {
              const colors =
                compareElement === 'primaryColors'
                  ? profile.colorPalette.primaryColors
                  : compareElement === 'accentColors'
                    ? profile.colorPalette.secondaryAccentColors
                    : profile.colorPalette.neutrals;

              return (
                <div key={`${profile.brandName}-${compareElement}`} className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-sm font-semibold text-zinc-900 mb-3">{profile.brandName}</p>
                  {colors.length > 0 ? (
                    <ul className="space-y-2">{colors.map(renderColorSwatch)}</ul>
                  ) : (
                    <p className="text-sm text-zinc-500">No color data available.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (compareElement === 'typography') {
      return (
        <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Typography Comparison</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.brandProfiles.map((profile) => (
              <div key={`${profile.brandName}-typography`} className="rounded-2xl border border-zinc-200 p-4">
                <p className="text-sm font-semibold text-zinc-900 mb-2">{profile.brandName}</p>
                <p className="text-sm text-zinc-700 mb-1"><span className="font-medium">Families:</span> {profile.typography.fontFamilies.join(', ') || 'Not provided'}</p>
                <p className="text-sm text-zinc-700"><span className="font-medium">H1:</span> {profile.typography.hierarchy.h1}</p>
                <p className="text-sm text-zinc-700"><span className="font-medium">H2:</span> {profile.typography.hierarchy.h2}</p>
                <p className="text-sm text-zinc-700"><span className="font-medium">Body:</span> {profile.typography.hierarchy.body}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-zinc-900">Imagery Style Comparison</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {report.brandProfiles.map((profile) => (
            <div key={`${profile.brandName}-imagery`} className="rounded-2xl border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-900 mb-2">{profile.brandName}</p>
              {profile.supportingVisualElements.imageryStyle.length > 0 ? (
                <ul className="space-y-1">
                  {profile.supportingVisualElements.imageryStyle.map((item, idx) => (
                    <li key={idx} className="text-sm text-zinc-700">• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No imagery style notes available.</p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  };

  useEffect(() => {
    if (!isLoading) {
      setFakeProgress(0);
      return;
    }

    setFakeProgress(8);
    const startedAt = Date.now();
    const progressInterval = setInterval(() => {
      setFakeProgress((prev) => {
        const elapsedMs = Date.now() - startedAt;
        const ceiling =
          elapsedMs < 4000
            ? 86
            : elapsedMs < 10000
              ? 94
              : elapsedMs < 20000
                ? 97.5
                : 99.2;

        if (prev >= ceiling) {
          return prev;
        }

        const step = Math.max(0.15, (ceiling - prev) * 0.08);
        return Math.min(ceiling, prev + step);
      });
    }, 140);

    return () => clearInterval(progressInterval);
  }, [isLoading]);

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

  useEffect(() => {
    if (!report) {
      setBestVisualsByBrand({});
      return;
    }

    const resolvedMap: Record<string, BrandVisualSelection> = {};

    report.brandProfiles.forEach((profile) => {
      const aiCardsRaw = dedupeVisualCards(
        [
          profile.logoImageUrl ? { label: 'Logo', url: profile.logoImageUrl } : null,
          ...(profile.sampleVisuals || []).map((visual) => ({
            label: visual.title || 'Visual',
            url: visual.url,
          })),
        ]
          .filter((card): card is BrandVisualCard => Boolean(card))
          .map((card) => ({
            ...card,
            url: normalizeHttpUrl(card.url) || '',
          }))
          .filter((card) => Boolean(card.url))
      );

      const aiNonLogoCards = aiCardsRaw.filter((card) => !isLogoLikeAsset(card.url, card.label));
      const aiLogoCard = aiCardsRaw.find((card) => isLogoLikeAsset(card.url, card.label));
      const aiCards = [...aiNonLogoCards, ...(aiLogoCard && aiNonLogoCards.length === 0 ? [aiLogoCard] : [])].slice(0, 4);

      const deterministicCards = dedupeVisualCards(
        [
          buildDeterministicLogoUrl(profile.website)
            ? { label: 'Primary Logo', url: buildDeterministicLogoUrl(profile.website) as string }
            : null,
          buildFaviconLogoUrl(profile.website)
            ? { label: 'Brand Mark', url: buildFaviconLogoUrl(profile.website) as string }
            : null,
        ].filter((card): card is BrandVisualCard => Boolean(card))
      );

      const screenshotTargets = dedupeVisualCards(
        [
          normalizeHttpUrl(profile.website),
          ...(profile.sources || []).map((source) => normalizeHttpUrl(source.url)),
        ]
          .filter((url): url is string => Boolean(url))
          .map((url, idx) => ({
            label: idx === 0 ? 'Homepage Preview' : `Source Preview ${idx}`,
            url,
          }))
      ).slice(0, 2);

      const screenshotCards = dedupeVisualCards(
        screenshotTargets.flatMap((target) => [
          { label: target.label, url: buildScreenshotPreviewUrl(target.url) },
          { label: `${target.label} (Alt)`, url: buildWordpressScreenshotUrl(target.url) },
        ])
      ).slice(0, 4);

      const methods: Record<VisualMethod, BrandVisualCard[]> = {
        ai: aiCards,
        deterministic: deterministicCards,
        screenshot: screenshotCards,
      };

      const candidates = (Object.keys(methods) as VisualMethod[])
        .map((method) => ({ method, images: methods[method], score: scoreVisualMethod(method, methods[method]) }))
        .filter((entry) => entry.images.length > 0)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return VISUAL_METHOD_PRIORITY.indexOf(a.method) - VISUAL_METHOD_PRIORITY.indexOf(b.method);
        });

      if (!candidates.length) {
        return;
      }

      resolvedMap[profile.brandName] = {
        method: candidates[0].method,
        images: candidates[0].images,
        deterministicLogoUrl: buildDeterministicLogoUrl(profile.website) || undefined,
      };
    });

    setBestVisualsByBrand(resolvedMap);
  }, [report]);

  const saveToLocalStorage = () => {
    if (!report) return;
    const filename = `brand_deepdive_${Date.now()}.json`;
    const data = {
      date: new Date().toISOString(),
      analysisObjective,
      targetAudience,
      report,
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setToast('Brand Deep Dive saved!');
  };

  const exportToPPTX = () => {
    if (!report) return;
    setIsExporting(true);
    setToast('Generating PowerPoint...');
    try {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';
      const titleSlide = pres.addSlide();
      titleSlide.background = { color: 'FAFAFA' };
      titleSlide.addText('Visual Design Deep Dive Report', { x: 0.5, y: 0.5, w: 9, h: 0.6, fontSize: 48, bold: true, color: '18181B' });
      if (analysisObjective) {
        titleSlide.addText(`Objective: ${analysisObjective}`, { x: 0.5, y: 1.3, w: 9, h: 0.6, fontSize: 16, color: '4F46E5' });
      }
      if (targetAudience) {
        titleSlide.addText(`Target Audience: ${targetAudience}`, { x: 0.5, y: 2.0, w: 9, h: 0.4, fontSize: 14, color: '52525B' });
      }
      titleSlide.addText(`Generated on ${new Date().toLocaleDateString()}`, { x: 0.5, y: 5.5, w: 9, h: 0.4, fontSize: 12, color: 'A1A1AA' });
      report.brandProfiles.forEach((profile) => {
        const slide = pres.addSlide();
        slide.background = { color: 'FAFAFA' };
        slide.addText(profile.brandName, { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 32, bold: true, color: '18181B' });
        if (profile.website) {
          slide.addText(profile.website, { x: 0.5, y: 0.85, w: 9, h: 0.3, fontSize: 12, color: '52525B' });
        }
        let currentY = 1.3;
        slide.addText('Distinctiveness', { x: 0.5, y: currentY, w: 9, h: 0.3, fontSize: 12, bold: true, color: '18181B' });
        currentY += 0.35;
        slide.addText(profile.distinctivenessAssessment, { x: 0.5, y: currentY, w: 9, h: 1.0, fontSize: 10, color: '3F3F46', valign: 'top' });
        currentY += 1.0;
        currentY += 0.2;
        slide.addText('Logo System', { x: 0.5, y: currentY, w: 4, h: 0.3, fontSize: 12, bold: true, color: '18181B' });
        currentY += 0.35;
        slide.addText(`Primary: ${profile.logo.mainLogo}`, { x: 0.5, y: currentY, w: 4, h: 0.25, fontSize: 10, color: '3F3F46' });
        currentY += 0.3;
        slide.addText(`Wordmark: ${profile.logo.wordmarkLogotype}`, { x: 0.5, y: currentY, w: 4, h: 0.25, fontSize: 10, color: '3F3F46' });
        currentY += 0.4;
        slide.addText('Primary Colors', { x: 5.2, y: 1.3, w: 4, h: 0.3, fontSize: 12, bold: true, color: '18181B' });
        let colorY = 1.65;
        profile.colorPalette.primaryColors.slice(0, 3).forEach((color) => {
          const colorBox = { x: 5.2, y: colorY, w: 0.3, h: 0.25, fill: { color: color.hex.replace('#', '') } };
          slide.addShape(pres.ShapeType.rect, colorBox);
          slide.addText(`${color.name} (${color.hex})`, { x: 5.6, y: colorY, w: 3.6, h: 0.25, fontSize: 9, color: '3F3F46' });
          colorY += 0.3;
        });
      });
      pres.writeFile({ fileName: `Visual_Design_DeepDive_${new Date().toISOString().split('T')[0]}.pptx` });
      setToast('PowerPoint exported successfully!');
    } catch (err) {
      console.error('Failed to generate PPTX:', err);
      setToast('Failed to generate PowerPoint.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = () => {
    if (!report) return;
    setIsExporting(true);
    setToast('Generating PDF...');
    import('jspdf').then(({ jsPDF }) => {
      try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - margin * 2;
        const addWrappedText = (text: string, x: number, y: number, fontSize: number, isBold: boolean = false, color: number[] = [0, 0, 0]) => {
          doc.setFontSize(fontSize);
          doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setTextColor(color[0], color[1], color[2]);
          const lines = doc.splitTextToSize(text, contentWidth);
          const lineHeightMm = fontSize * 0.352778 * 1.5;
          for (let i = 0; i < lines.length; i++) {
            if (y > pageHeight - margin) {
              doc.addPage();
              y = margin;
            }
            doc.text(lines[i], x, y);
            y += lineHeightMm;
          }
          return y + 2;
        };
        let y = margin;
        y = addWrappedText('Visual Design Deep Dive Report', margin, y, 22, true, [24, 24, 27]);
        y += 5;
        if (analysisObjective) {
          addWrappedText(`Objective: ${analysisObjective}`, margin, y, 11, true, [79, 70, 229]);
          y += 8;
        }
        if (targetAudience) {
          addWrappedText(`Target Audience: ${targetAudience}`, margin, y, 11, false, [82, 82, 91]);
          y += 6;
        }
        y += 3;
        report.brandProfiles.forEach((profile, profileIdx) => {
          if (y > pageHeight - margin - 20) {
            doc.addPage();
            y = margin;
          }
          y = addWrappedText(profile.brandName, margin, y, 16, true, [24, 24, 27]);
          if (profile.website) {
            y = addWrappedText(profile.website, margin, y, 10, false, [82, 82, 91]);
          }
          y += 3;
          y = addWrappedText('Distinctiveness', margin, y, 11, true, [24, 24, 27]);
          y = addWrappedText(profile.distinctivenessAssessment, margin, y, 10, false, [63, 63, 70]);
          y += 3;
          y = addWrappedText('Logo System', margin, y, 11, true, [24, 24, 27]);
          y = addWrappedText(`Primary: ${profile.logo.mainLogo}`, margin, y, 10, false, [63, 63, 70]);
          y = addWrappedText(`Wordmark: ${profile.logo.wordmarkLogotype}`, margin, y, 10, false, [63, 63, 70]);
          y += 2;
          y = addWrappedText('Variations', margin, y, 10, true, [63, 63, 70]);
          profile.logo.logoVariations.forEach((variation) => {
            y = addWrappedText(`• ${variation}`, margin + 3, y, 9, false, [82, 82, 91]);
          });
          y += 2;
          y = addWrappedText('Typography', margin, y, 11, true, [24, 24, 27]);
          y = addWrappedText(`Families: ${profile.typography.fontFamilies.join(', ')}`, margin, y, 10, false, [63, 63, 70]);
          y = addWrappedText(`H1: ${profile.typography.hierarchy.h1}`, margin, y, 9, false, [82, 82, 91]);
          y = addWrappedText(`H2: ${profile.typography.hierarchy.h2}`, margin, y, 9, false, [82, 82, 91]);
          y = addWrappedText(`Body: ${profile.typography.hierarchy.body}`, margin, y, 9, false, [82, 82, 91]);
          y += 2;
          y = addWrappedText('Primary Colors', margin, y, 11, true, [24, 24, 27]);
          profile.colorPalette.primaryColors.forEach((color) => {
            y = addWrappedText(`• ${color.name} (${color.hex})`, margin + 3, y, 9, false, [82, 82, 91]);
          });
          y += 2;
          y = addWrappedText('Accent Colors', margin, y, 11, true, [24, 24, 27]);
          profile.colorPalette.secondaryAccentColors.forEach((color) => {
            y = addWrappedText(`• ${color.name} (${color.hex})`, margin + 3, y, 9, false, [82, 82, 91]);
          });
          y += 2;
          y = addWrappedText('Supporting Visual Elements', margin, y, 11, true, [24, 24, 27]);
          y = addWrappedText('Imagery Style', margin, y, 10, true, [63, 63, 70]);
          profile.supportingVisualElements.imageryStyle.forEach((item) => {
            y = addWrappedText(`• ${item}`, margin + 3, y, 9, false, [82, 82, 91]);
          });
          y += 1;
          y = addWrappedText('Icons', margin, y, 10, true, [63, 63, 70]);
          profile.supportingVisualElements.icons.forEach((item) => {
            y = addWrappedText(`• ${item}`, margin + 3, y, 9, false, [82, 82, 91]);
          });
          y += 4;
          if (profileIdx < report.brandProfiles.length - 1) {
            doc.addPage();
            y = margin;
          }
        });
        if (report.crossBrandReadout && report.crossBrandReadout.length > 0) {
          if (y > pageHeight - margin - 20) {
            doc.addPage();
            y = margin;
          }
          y = addWrappedText('Opportunity Spaces', margin, y, 14, true, [24, 24, 27]);
          report.crossBrandReadout.forEach((item) => {
            y = addWrappedText(`• ${item}`, margin + 3, y, 10, false, [82, 82, 91]);
          });
        }
        doc.save(`Visual_Design_DeepDive_${new Date().toISOString().split('T')[0]}.pdf`);
        setToast('PDF exported successfully!');
      } catch (err) {
        console.error('Failed to generate PDF:', err);
        setToast('Failed to generate PDF.');
      } finally {
        setIsExporting(false);
      }
    });
  };

  return (
    <div className="w-full">
      {/* Top Navigation / Actions */}
      <div className="absolute top-6 right-6 z-50 no-print flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
        >
          <Search className="w-4 h-4" /> Cultural Archeologist
        </button>
        <button
          type="button"
          onClick={clearDeepDiveSearch}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-zinc-200 text-zinc-700 rounded-full font-medium hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-1 transition-all shadow-sm text-sm"
        >
          <RefreshCw className="w-4 h-4" /> New Search
        </button>
      </div>

      <AnimatePresence>
        {undoToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed ${toast ? 'top-20' : 'top-6'} left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-4 text-sm no-print`}
          >
            <Info className="w-4 h-4 text-indigo-400" />
            <span>{undoToast.message}</span>
            <button
              onClick={undoDeleteSavedSearch}
              className="text-indigo-400 hover:text-indigo-300 font-medium px-3 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centered Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12 text-center flex flex-col items-center"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-6">
          <Sparkles className="w-5 h-5" />
        </div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-zinc-900 mb-6 select-none">
          Visual Design <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">Deep Dive</span>
        </h1>
        <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed select-none">
          Compare visual identity systems across 1-6 brands.
        </p>
      </motion.div>

      <div className="w-full max-w-4xl mx-auto">

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        onSubmit={handleSubmit}
        noValidate
        className="w-full relative flex flex-col gap-4 bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 md:p-8 space-y-4"
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

        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="px-8 py-3 bg-zinc-900 text-white rounded-2xl font-medium hover:bg-zinc-800 transition-colors disabled:opacity-60 inline-flex items-center gap-2 relative overflow-hidden"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Auditing Brand Systems... {Math.round(fakeProgress)}%
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Visual Identity Deep Dive
              </>
            )}
            {isLoading && (
              <div className="absolute left-3 right-3 bottom-2 h-1 rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-fuchsia-400 transition-all duration-200"
                  style={{ width: `${fakeProgress}%` }}
                />
              </div>
            )}
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </motion.form>

      <section className="mt-6 bg-white rounded-3xl border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-zinc-400" />
          <h3 className="text-xl font-semibold text-zinc-900">Your Library</h3>
          <span className="text-xs text-zinc-400 ml-auto">{savedSearches.length} saved</span>
        </div>
        {savedSearches.length === 0 ? (
          <p className="text-sm text-zinc-500">Run a deep dive to start building your saved search library.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
            {savedSearches.map((saved) => (
              <div
                key={saved.id}
                onClick={() => loadSavedSearch(saved)}
                className="group relative bg-zinc-50 border border-zinc-200 rounded-2xl p-4 hover:shadow-sm hover:border-indigo-200 cursor-pointer transition-all"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSavedSearch(saved.id);
                  }}
                  className="absolute top-3 right-3 p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                  title="Delete saved report"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <p className="text-sm font-semibold text-zinc-900 truncate pr-8">
                  {saved.brands.map((b) => b.name).join(' vs ')}
                </p>
                <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                  {saved.targetAudience || 'No audience provided'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {new Date(saved.date).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      <AnimatePresence mode="wait">
        {report && (
          <motion.div
            key="brand-deep-dive-report"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-4xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <section className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResultTab('profiles')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${resultTab === 'profiles' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
                >
                  Brand Profiles
                </button>
                <button
                  type="button"
                  onClick={() => setResultTab('compare')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${resultTab === 'compare' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
                >
                  Visual Compare
                </button>
                {resultTab === 'compare' && (
                  <select
                    value={compareElement}
                    onChange={(e) => setCompareElement(e.target.value as CompareElement)}
                    className="ml-auto px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="primaryColors">Primary Colors</option>
                    <option value="accentColors">Accent Colors</option>
                    <option value="neutrals">Neutrals</option>
                    <option value="typography">Typography</option>
                    <option value="imageryStyle">Imagery Style</option>
                  </select>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportToPPTX}
                    disabled={isExporting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm transition-colors disabled:opacity-50"
                    aria-label="Export to PowerPoint"
                  >
                    <Share2 className="w-4 h-4" />
                    Export PPTX
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">Beta</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportToPDF}
                    disabled={isExporting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm transition-colors disabled:opacity-50"
                    aria-label="Export to PDF"
                  >
                    <Share2 className="w-4 h-4" />
                    Export PDF
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100">Beta</span>
                  </button>
                </div>
              </div>
              {toast && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-700 text-sm">
                  {toast}
                </div>
              )}
            </section>

            {resultTab === 'compare' ? (
              renderComparePanel()
            ) : (
              <>
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
                    {isDevMode && profile.matchSource && (
                      <p className="text-xs text-indigo-600 mt-1">
                        matched by: {profile.matchSource}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <p className="font-medium">Consistency</p>
                    <p>{profile.consistencyAssessment}</p>
                  </div>
                </div>

                {(() => {
                  const visuals = bestVisualsByBrand[profile.brandName];
                  return visuals ? (
                    <div className="rounded-2xl border border-zinc-200 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 inline-flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" /> Visual Reference Cards
                        </h4>
                        <span className="text-xs text-zinc-500">Method: {VISUAL_METHOD_LABEL[visuals.method]}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {visuals.images.map((image, idx) => {
                          const sourceUrl = profile.website || '';
                          const fallbackImageUrl = buildFaviconLogoUrl(profile.website) || '';
                          const visualClass =
                            visuals.method === 'screenshot'
                              ? 'w-full h-44 object-cover hover:brightness-95 transition-all'
                              : 'w-full h-44 object-contain bg-white p-2 transition-all';
                          return (
                            <figure key={`${profile.brandName}-visual-${idx}`} className="rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden hover:shadow-md transition-shadow">
                              {sourceUrl ? (
                                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
                                  <img
                                    src={image.url}
                                    alt={`${profile.brandName} - ${image.label}`}
                                    loading="lazy"
                                    referrerPolicy="origin"
                                    data-fallback={fallbackImageUrl}
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      const fallback = target.dataset.fallback || '';
                                      if (fallback && target.src !== fallback) {
                                        target.src = fallback;
                                        return;
                                      }
                                      target.style.display = 'none';
                                    }}
                                    className={visualClass}
                                  />
                                </a>
                              ) : (
                                <img
                                  src={image.url}
                                  alt={`${profile.brandName} - ${image.label}`}
                                  loading="lazy"
                                  referrerPolicy="origin"
                                  data-fallback={fallbackImageUrl}
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    const fallback = target.dataset.fallback || '';
                                    if (fallback && target.src !== fallback) {
                                      target.src = fallback;
                                      return;
                                    }
                                    target.style.display = 'none';
                                  }}
                                  className={visualClass}
                                />
                              )}
                              <figcaption className="px-3 py-2 text-xs text-zinc-600">{image.label}</figcaption>
                            </figure>
                          );
                        })}
                      </div>
                    </div>
                  ) : null;
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">Logo System</h4>
                    {(() => {
                      const visuals = bestVisualsByBrand[profile.brandName];
                      const logoUrl = visuals?.deterministicLogoUrl;
                      const fallbackLogoUrl = buildFaviconLogoUrl(profile.website);
                      return logoUrl ? (
                        <div className="mb-4 rounded-lg bg-zinc-50 p-3 flex items-center justify-center">
                          <img
                            src={logoUrl}
                            alt={`${profile.brandName} Logo`}
                            className="max-h-24 max-w-full object-contain"
                            data-fallback={fallbackLogoUrl || ''}
                            onError={(e) => {
                              const target = e.currentTarget;
                              const fallback = target.dataset.fallback || '';
                              if (fallback && target.src !== fallback) {
                                target.src = fallback;
                                return;
                              }
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                      ) : null;
                    })()}
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
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}