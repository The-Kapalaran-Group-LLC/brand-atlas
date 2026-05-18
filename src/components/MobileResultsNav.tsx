import React from 'react';

type MobileResultsNavItem = {
  id: string;
  label: string;
};

interface MobileResultsNavProps {
  items: MobileResultsNavItem[];
  testId: string;
}

export function MobileResultsNav({ items, testId }: MobileResultsNavProps) {
  const handleScrollToSection = (item: MobileResultsNavItem) => {
    console.log('[MobileResultsNav] Jump requested.', {
      targetId: item.id,
      label: item.label,
      itemCount: items.length,
    });

    const target = document.getElementById(item.id);
    if (!target) {
      console.log('[MobileResultsNav] Target section not found.', {
        targetId: item.id,
        label: item.label,
      });
      return;
    }

    console.log('[MobileResultsNav] Scrolling to target section.', {
      targetId: item.id,
      label: item.label,
    });
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (items.length === 0) {
    console.log('[MobileResultsNav] No items available; skipping render.');
    return null;
  }

  return (
    <div
      data-testid={testId}
      className="sm:hidden mb-4 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur no-print"
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Jump To Section</p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleScrollToSection(item)}
            className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
