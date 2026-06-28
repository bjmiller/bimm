import { useLayoutEffect, useRef, useState } from 'react';

export interface TruncatedPathProps {
  path: string;
  className?: string;
  /** Path segment separator. Defaults to `/`. */
  separator?: string;
}

/**
 * Renders a filesystem path, collapsing the leftmost segments into a single
 * ellipsis (Starship-prompt style) when the path is too long to fit its
 * container. The rightmost segments are always preserved because they are the
 * most meaningful.
 *
 * Measurement uses a hidden mirror of the full path and recomputes whenever
 * the container is resized (via a single ResizeObserver).
 */
export const TruncatedPath = ({ path, className, separator = '/' }: TruncatedPathProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const ellipsisRef = useRef<HTMLSpanElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);

  // Split into segments, tracking a leading separator (e.g. for `/Music/...`).
  const segments = path.split(separator);
  const leading = segments.length > 1 && segments[0] === '' ? 1 : 0;
  const rest = segments.slice(leading);

  // Single effect: measure on mount and on every resize. The ResizeObserver's
  // initial callback fires synchronously after layout on observe(), so this
  // also covers the first paint without a separate effect.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const measureNow = () => {
      const available = container.clientWidth;
      if (available === 0) return;

      const segSpans = measure.querySelectorAll<HTMLElement>('[data-seg]');
      // Each measured span is `separator + segment`, so widths already include
      // the preceding separator. This slightly overcounts for the first segment
      // (which has no preceding separator in the non-truncated render), which
      // is a conservative measurement and safe.
      const widths = Array.from(segSpans).map((s) => s.getBoundingClientRect().width);
      const ellipsisWidth = ellipsisRef.current?.getBoundingClientRect().width ?? 0;

      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) {
        setHiddenCount(0);
        return;
      }

      // Greedily keep as many rightmost segments as fit alongside the ellipsis.
      let acc = ellipsisWidth;
      let kept = 0;
      for (let i = widths.length - 1; i >= 0; i--) {
        const w = widths[i];
        if (w == null || acc + w > available) break;
        acc += w;
        kept += 1;
      }

      // Always keep at least the final segment; the container clips any overflow.
      if (kept < 1) kept = 1;

      const hidden = Math.max(0, rest.length - kept);
      setHiddenCount((prev) => (prev === hidden ? prev : hidden));
    };

    // Measure immediately for the initial layout.
    measureNow();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureNow);
    ro.observe(container);
    return () => ro.disconnect();
  }, [path, rest.length, separator]);

  const visible = rest.slice(hiddenCount);
  const prefix = leading ? separator : '';
  const ellipsis = hiddenCount > 0 ? `\u2026${separator}` : '';
  const text = prefix + ellipsis + visible.join(separator);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap' }}
    >
      {/* Hidden mirror used to measure the natural width of each segment. */}
      <span
        ref={measureRef}
        aria-hidden
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}
      >
        {rest.map((seg, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} data-seg>
            {separator + seg}
          </span>
        ))}
      </span>
      <span
        ref={ellipsisRef}
        aria-hidden
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}
      >
        {`…${separator}`}
      </span>
      <span>{text}</span>
    </div>
  );
};
