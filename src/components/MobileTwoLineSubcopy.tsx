import { useCallback, useEffect, useRef, useState } from 'react';

type MobileTwoLineSubcopyProps = {
  children: string;
  className?: string;
  testId?: string;
};

const MAX_FONT_SIZE_PX = 30.56; // 1.91rem
const MIN_FONT_SIZE_PX = 16;
const FONT_STEP_PX = 0.5;
const TARGET_LINE_COUNT = 2;
const FALLBACK_LINE_HEIGHT_MULTIPLIER = 1.15;

export function MobileTwoLineSubcopy({
  children,
  className = '',
  testId = 'mobile-page-subcopy',
}: MobileTwoLineSubcopyProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [fontSizePx, setFontSizePx] = useState(MAX_FONT_SIZE_PX);

  const fitToTwoLines = useCallback(() => {
    const element = textRef.current;
    if (!element || typeof window === 'undefined') {
      return;
    }

    let fittedSize = MIN_FONT_SIZE_PX;

    for (let currentSize = MAX_FONT_SIZE_PX; currentSize >= MIN_FONT_SIZE_PX; currentSize -= FONT_STEP_PX) {
      element.style.fontSize = `${currentSize}px`;
      const computedStyle = window.getComputedStyle(element);
      const lineHeightValue = parseFloat(computedStyle.lineHeight);
      const effectiveLineHeight = Number.isFinite(lineHeightValue)
        ? lineHeightValue
        : currentSize * FALLBACK_LINE_HEIGHT_MULTIPLIER;
      const maxAllowedHeight = (effectiveLineHeight * TARGET_LINE_COUNT) + 0.5;

      if (element.scrollHeight <= maxAllowedHeight) {
        fittedSize = currentSize;
        break;
      }
    }

    setFontSizePx((previousValue) => (
      Math.abs(previousValue - fittedSize) < 0.1 ? previousValue : fittedSize
    ));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const scheduleFit = () => {
      window.requestAnimationFrame(() => {
        fitToTwoLines();
      });
    };

    scheduleFit();
    window.addEventListener('resize', scheduleFit);

    const parentElement = textRef.current?.parentElement;
    const supportsResizeObserver = typeof ResizeObserver !== 'undefined';
    const resizeObserver = supportsResizeObserver && parentElement
      ? new ResizeObserver(scheduleFit)
      : null;

    if (resizeObserver && parentElement) {
      resizeObserver.observe(parentElement);
    }

    return () => {
      window.removeEventListener('resize', scheduleFit);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [fitToTwoLines, children]);

  return (
    <p
      ref={textRef}
      data-testid={testId}
      className={`text-center font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500 ${className}`.trim()}
      style={{ fontSize: `${fontSizePx}px`, lineHeight: FALLBACK_LINE_HEIGHT_MULTIPLIER }}
    >
      {children}
    </p>
  );
}

