import { useCallback, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Observe an element's content-box size. Returns a callback ref and the size
 * (0×0 until measured). Used by SVG charts that render at exact pixel size.
 */
export function useElementSize<T extends Element = HTMLDivElement>(): [
  (node: T | null) => void,
  ElementSize,
] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((node: T | null) => {
    if (!node) return;
    const update = (width: number, height: number) =>
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    if (typeof ResizeObserver === "undefined") {
      const rect = node.getBoundingClientRect();
      update(rect.width, rect.height);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) update(Math.round(rect.width * 100) / 100, Math.round(rect.height * 100) / 100);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
