import { useEffect, useRef } from "react";

export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | (() => void),
  deps: React.DependencyList
): void {
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    const controller = new AbortController();
    const cleanup = effectRef.current(controller.signal);
    return () => {
      controller.abort();
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (typeof err === "object" && err != null && "name" in err) {
    return (err as { name?: string }).name === "AbortError";
  }
  return false;
}
