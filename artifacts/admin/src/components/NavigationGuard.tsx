import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

interface NavigationGuardProps {
  isDirty: boolean;
  message?: string;
}

/**
 * NavigationGuard — shows a confirmation dialog when navigating away
 * from a page that has unsaved changes.
 *
 * Usage:
 *   <NavigationGuard isDirty={formIsDirty} />
 *
 * Handles:
 *  - Browser tab close / refresh (beforeunload)
 *  - In-app navigation via Wouter's useLocation
 */
export function NavigationGuard({
  isDirty,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: NavigationGuardProps) {
  const [location, setLocation] = useLocation();
  const prevLocationRef = useRef(location);
  const isDirtyRef = useRef(isDirty);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [message]);

  useEffect(() => {
    if (location !== prevLocationRef.current) {
      if (isDirtyRef.current) {
        const confirmed = window.confirm(message);
        if (!confirmed) {
          setLocation(prevLocationRef.current);
          return;
        }
      }
      prevLocationRef.current = location;
    }
  }, [location, message, setLocation]);

  return null;
}
