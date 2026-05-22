import React, { useEffect } from "react";
import * as Linking from "expo-linking";
import { router, type Href } from "expo-router";
import { log } from "./_shared";

export function DeepLinkHandler() {
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      try {
        const parsed = new URL(url);
        const rawPath = parsed.pathname.replace(/^\//, "");
        const path = rawPath.split("/")[0] || parsed.hostname || "";

        if (path === "magic-link" || path === "auth") return;

        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => { params[key] = value; });

        const routeMap: Record<string, string> = {
          product: "/product/{id}",
          vendor: "/vendor/{id}",
          order: "/orders/{id}",
          category: "/categories",
          promo: "/offers",
          ride: "/ride",
          food: "/food",
          mart: "/mart",
          pharmacy: "/pharmacy",
          parcel: "/parcel",
          van: "/van",
        };

        let resolvedPath = path;
        let pathSegmentId: string | undefined;
        if (!routeMap[path] && parsed.hostname && routeMap[parsed.hostname]) {
          resolvedPath = parsed.hostname;
          pathSegmentId = rawPath.split("/")[0] || undefined;
        }

        const pushNotFound = () => {
          setTimeout(() => {
            try {
              router.push("/+not-found" as Href);
            } catch (e) { log.warn("DeepLinkHandler: router.push /+not-found failed", e); }
          }, 500);
        };

        const route = routeMap[resolvedPath];
        if (!route) { pushNotFound(); return; }

        let targetPath = route;
        if (route.includes("{id}")) {
          const id = params.productId || params.vendorId || params.id || pathSegmentId || "";
          if (!id) { pushNotFound(); return; }
          targetPath = route.replace("{id}", id);
        }

        if (resolvedPath === "ride" && (params.pickup || params.dropoff)) {
          const queryParts: string[] = [];
          if (params.pickup) queryParts.push(`pickup=${encodeURIComponent(params.pickup)}`);
          if (params.dropoff) queryParts.push(`dropoff=${encodeURIComponent(params.dropoff)}`);
          if (params.pickupLat) queryParts.push(`pickupLat=${encodeURIComponent(params.pickupLat)}`);
          if (params.pickupLng) queryParts.push(`pickupLng=${encodeURIComponent(params.pickupLng)}`);
          if (params.dropoffLat) queryParts.push(`dropoffLat=${encodeURIComponent(params.dropoffLat)}`);
          if (params.dropoffLng) queryParts.push(`dropoffLng=${encodeURIComponent(params.dropoffLng)}`);
          if (queryParts.length) targetPath += `?${queryParts.join("&")}`;
        }

        if (resolvedPath === "category" && params.categoryId) {
          targetPath = `/categories?id=${encodeURIComponent(params.categoryId)}`;
        }

        if (resolvedPath === "promo" && params.code) {
          targetPath = `/offers?code=${encodeURIComponent(params.code)}`;
        }

        if (!targetPath.startsWith("/")) { pushNotFound(); return; }

        setTimeout(() => {
          try {
            router.push(targetPath as Href);
          } catch {
            log.warn("DeepLink: Could not navigate to:", targetPath);
          }
        }, 500);
      } catch (e) { log.warn("DeepLinkHandler: URL parse error", e); }
    };

    const sub = Linking.addEventListener("url", (event) => handleDeepLink(event.url));
    Linking.getInitialURL()
      .then((url) => { if (url) handleDeepLink(url); })
      .catch((e: unknown) => { log.warn("DeepLinkHandler: getInitialURL failed", e); });
    return () => sub.remove();
  }, []);

  return null;
}

export default null;
