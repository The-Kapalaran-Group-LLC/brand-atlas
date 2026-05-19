import React, { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

interface ShowThinkingDropdownProps {
  methodologyText: string;
  testIdPrefix: string;
  className?: string;
}

export const ShowThinkingDropdown: React.FC<ShowThinkingDropdownProps> = ({
  methodologyText,
  testIdPrefix,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle: React.ReactEventHandler<HTMLDetailsElement> = (event) => {
    const nextOpen = event.currentTarget.open;
    setIsOpen(nextOpen);
    console.log('[ShowThinkingDropdown] Toggled methodology panel.', {
      testIdPrefix,
      isOpen: nextOpen,
    });
  };

  return (
    <details
      data-testid={`${testIdPrefix}-container`}
      onToggle={handleToggle}
      className={`mb-6 no-print ${className || ''}`}
    >
      <summary
        data-testid={`${testIdPrefix}-summary`}
        className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-normal text-zinc-900"
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="inline-flex items-center gap-1.5">
            <span>Show thinking</span>
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          </span>
        </span>
      </summary>
      <p
        data-testid={`${testIdPrefix}-content`}
        className="mt-2 text-sm leading-6 text-zinc-600"
      >
        {methodologyText}
      </p>
    </details>
  );
};
