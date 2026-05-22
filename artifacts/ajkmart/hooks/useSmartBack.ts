import { useCallback } from "react";
import { router, useNavigation, type Href } from "expo-router";

const HOME_ROUTE = "/(tabs)" satisfies Href;

export function useSmartBack(fallback: Href = HOME_ROUTE) {
  const navigation = useNavigation();

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }, [navigation, fallback]);

  const goHome = useCallback(() => {
    router.replace(HOME_ROUTE);
  }, []);

  return { goBack, goHome, canGoBack: navigation.canGoBack() };
}
