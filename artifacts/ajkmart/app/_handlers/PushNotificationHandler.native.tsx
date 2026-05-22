import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { router } from "expo-router";
import { createLogger } from "@/utils/logger";
const log = createLogger("[PushNotification]");

function PushNotificationHandlerNative() {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse) return;
    const data = lastResponse.notification.request.content.data as Record<
      string,
      string | undefined
    >;
    const { orderId, rideId, parcelId, screen } = data;

    const navigate = () => {
      try {
        if (orderId) {
          router.push({ pathname: "/orders/[id]", params: { id: orderId } });
        } else if (rideId) {
          router.push({ pathname: "/ride", params: { rideId } });
        } else if (parcelId) {
          router.push({ pathname: "/orders/[id]", params: { id: parcelId } });
        } else if (screen === "orders") {
          router.push("/(tabs)/orders");
        } else if (screen === "wallet") {
          router.push("/wallet");
        } else if (screen === "mart") {
          router.push("/mart");
        }
      } catch (e) {
        log.warn("PushNotificationHandler: Navigation failed", e);
      }
    };

    setTimeout(navigate, 500);
  }, [lastResponse?.notification.request.identifier]);

  return null;
}

export function PushNotificationHandler() {
  return <PushNotificationHandlerNative />;
}

export default null;
