import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

interface KeyboardShortcutsOptions {
  onOpenSearch: () => void;
  onCloseModal: () => void;
  onNewItem?: () => void;
}

const NEW_ITEM_ROUTES: Record<string, string> = {
  "/users": "new-user",
  "/riders": "new-rider",
  "/products": "new-product",
  "/vendors": "new-vendor",
  "/promo-codes": "new-promo",
  "/banners": "new-banner",
  "/flash-deals": "new-deal",
};

export function useKeyboardShortcuts({
  onOpenSearch,
  onCloseModal,
  onNewItem,
}: KeyboardShortcutsOptions) {
  const [location] = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (e.target as HTMLElement)?.isContentEditable;

      if (e.key === "Escape") {
        onCloseModal();
        return;
      }

      if (isInput) return;

      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onOpenSearch();
        return;
      }

      if (e.key === "n" || e.key === "N") {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const route = locationRef.current;
        const matchedRoute = Object.keys(NEW_ITEM_ROUTES).find((r) => route.startsWith(r));
        if (matchedRoute && onNewItem) {
          e.preventDefault();
          onNewItem();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenSearch, onCloseModal, onNewItem]);
}
