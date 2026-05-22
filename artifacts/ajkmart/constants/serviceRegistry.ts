import { type Href } from "expo-router";
import type { Ionicons } from "@expo/vector-icons";
import Colors from "./colors";
export { type ServiceKey, SERVICE_KEYS as SERVICE_KEY_LIST, SERVICE_METADATA } from "@workspace/service-constants";
import { type ServiceKey, SERVICE_KEYS } from "@workspace/service-constants";

const C = Colors.light;

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface ServiceDefinition {
  key: ServiceKey;
  featureFlag: string;
  label: string;
  description: string;
  icon: IoniconName;
  iconFocused: IoniconName;
  route: Href;
  color: string;
  colorLight: string;
  gradient: [string, string];
  cardGradient: [string, string];
  iconGradient: [string, string];
  textColor: string;
  tagColor: string;
  tagBg: string;
  tag: string;
  tagIcon: IoniconName;
  heroConfig: {
    badgeIcon: IoniconName;
    badgeLabel: string;
    title: string;
    subtitle: string;
    stats: Array<{ icon: IoniconName; label: string }>;
    cta: string;
    gradient: [string, string, string];
  };
  banners: Array<{
    title: string;
    desc: string;
    tag: string;
    c1: string;
    c2: string;
    icon: IoniconName;
    cta: string;
  }>;
  quickActions: Array<{
    icon: IoniconName;
    label: string;
    color: string;
    bg: string;
    route: Href;
  }>;
  tabLabel: string;
  adminDescription: string;
  adminIcon: string;
}

export const SERVICE_REGISTRY: Record<ServiceKey, ServiceDefinition> = {
  mart: {
    key: "mart",
    featureFlag: "feature_mart",
    label: "Grocery Mart",
    description: "Fresh groceries & essentials delivered to your door",
    icon: "storefront-outline",
    iconFocused: "storefront",
    route: "/mart" as Href,
    color: C.mart,
    colorLight: C.martLight,
    gradient: ["#0052CC", "#3385FF"],
    cardGradient: [C.martLight, "#CCF0E0"],
    iconGradient: [C.mart, "#33D4A7"],
    textColor: "#005C44",
    tagColor: "#005C44",
    tagBg: "#99ECCC",
    tag: "500+ items",
    tagIcon: "cube-outline",
    heroConfig: {
      badgeIcon: "storefront",
      badgeLabel: "Grocery Mart",
      title: "AJKMart",
      subtitle: "Fresh groceries & essentials\ndelivered to your door",
      stats: [
        { icon: "cube-outline", label: "500+ items" },
        { icon: "time-outline", label: "20 min delivery" },
      ],
      cta: "Shop Now",
      gradient: ["#0052CC", C.primary, "#3385FF"],
    },
    banners: [
      {
        title: "Free Delivery",
        desc: "Free delivery on your first order — try it today!",
        tag: "New Users",
        c1: C.primary,
        c2: "#3385FF",
        icon: "cart-outline",
        cta: "Shop Now",
      },
      {
        title: "Flash Deals",
        desc: "New deals daily — save 20% on fruits, veggies, milk & more!",
        tag: "Flash Sale",
        c1: "#4B47D6",
        c2: C.info,
        icon: "flash-outline",
        cta: "View Deals",
      },
    ],
    quickActions: [
      { icon: "leaf-outline", label: "Fruits", color: C.mart, bg: C.martLight, route: "/mart" as Href },
      { icon: "flash-outline", label: "Deals", color: C.danger, bg: C.dangerSoft, route: "/mart" as Href },
    ],
    tabLabel: "Mart",
    adminDescription: "Grocery & essentials marketplace with 500+ products",
    adminIcon: "🛒",
  },

  food: {
    key: "food",
    featureFlag: "feature_food",
    label: "Food Delivery",
    description: "Restaurants near you, delivered fast",
    icon: "restaurant-outline",
    iconFocused: "restaurant",
    route: "/food" as Href,
    color: C.food,
    colorLight: C.foodLight,
    gradient: [C.foodLight, "#FEE8CC"],
    cardGradient: [C.foodLight, "#FEE8CC"],
    iconGradient: [C.food, "#FFB340"],
    textColor: "#7A5A00",
    tagColor: "#7A5A00",
    tagBg: "#FFE6B3",
    tag: "30 min",
    tagIcon: "time-outline",
    heroConfig: {
      badgeIcon: "restaurant",
      badgeLabel: "Food Delivery",
      title: "Food",
      subtitle: "Restaurants near you\ndelivered in 30 minutes",
      stats: [
        { icon: "restaurant-outline", label: "50+ restaurants" },
        { icon: "time-outline", label: "30 min delivery" },
      ],
      cta: "Order Now",
      gradient: ["#E68600", C.food, "#FFB340"],
    },
    banners: [
      {
        title: "Local Food Deal",
        desc: "Place 2 food orders and get 20% off your next one!",
        tag: "Food Deal",
        c1: "#E68600",
        c2: C.food,
        icon: "restaurant-outline",
        cta: "Order Now",
      },
    ],
    quickActions: [
      { icon: "pizza-outline", label: "Pizza", color: C.food, bg: C.foodLight, route: "/food" as Href },
    ],
    tabLabel: "Food",
    adminDescription: "Restaurant food ordering & delivery service",
    adminIcon: "🍔",
  },

  rides: {
    key: "rides",
    featureFlag: "feature_rides",
    label: "Rides",
    description: "Safe & affordable bike and car rides",
    icon: "car-outline",
    iconFocused: "car",
    route: "/ride" as Href,
    color: C.success,
    colorLight: C.successSoft,
    gradient: [C.successSoft, "#CCF5E7"],
    cardGradient: [C.successSoft, "#CCF5E7"],
    iconGradient: [C.success, "#33D4A7"],
    textColor: "#005C44",
    tagColor: "#005C44",
    tagBg: "#99ECCC",
    tag: "Instant",
    tagIcon: "flash-outline",
    heroConfig: {
      badgeIcon: "car",
      badgeLabel: "Rides",
      title: "Rides",
      subtitle: "Safe & affordable rides\nanywhere in AJK",
      stats: [
        { icon: "bicycle-outline", label: "Bike from Rs.45" },
        { icon: "car-outline", label: "Car from Rs.80" },
      ],
      cta: "Book a Ride",
      gradient: [C.success, "#00C48C", "#00E6A0"],
    },
    banners: [
      {
        title: "Bike Ride 10% Off",
        desc: "Book a bike from just Rs. 45 — anywhere in AJK!",
        tag: "Weekend Deal",
        c1: C.success,
        c2: "#00E6A0",
        icon: "bicycle-outline",
        cta: "Book a Ride",
      },
    ],
    quickActions: [
      { icon: "bicycle-outline", label: "Bike", color: C.info, bg: C.infoSoft, route: "/ride" as Href },
      { icon: "car-outline", label: "Car", color: C.success, bg: C.successSoft, route: "/ride" as Href },
    ],
    tabLabel: "Rides",
    adminDescription: "Bike & car ride booking with live tracking",
    adminIcon: "🚗",
  },

  pharmacy: {
    key: "pharmacy",
    featureFlag: "feature_pharmacy",
    label: "Pharmacy",
    description: "Medicines delivered from home in 25-40 min",
    icon: "medkit-outline",
    iconFocused: "medkit",
    route: "/pharmacy" as Href,
    color: C.pharmacy,
    colorLight: C.pharmacyLight,
    gradient: [C.pharmacyLight, "#EDD6FF"],
    cardGradient: [C.pharmacyLight, "#EDD6FF"],
    iconGradient: [C.pharmacy, "#C77DEB"],
    textColor: "#5A1D8C",
    tagColor: "#5A1D8C",
    tagBg: "#DDB8FF",
    tag: "25-40 min",
    tagIcon: "medkit-outline",
    heroConfig: {
      badgeIcon: "medkit",
      badgeLabel: "Pharmacy",
      title: "Pharmacy",
      subtitle: "Order medicines from home\ndelivery in 25-40 min",
      stats: [
        { icon: "medkit-outline", label: "All medicines" },
        { icon: "time-outline", label: "25-40 min" },
      ],
      cta: "Order Now",
      gradient: ["#9B40D6", C.pharmacy, "#C77DEB"],
    },
    banners: [
      {
        title: "Pharmacy",
        desc: "Order medicines from home — delivery in 25-40 min!",
        tag: "On-Demand",
        c1: "#9B40D6",
        c2: C.pharmacy,
        icon: "medkit-outline",
        cta: "Order Now",
      },
    ],
    quickActions: [
      { icon: "medkit-outline", label: "Pharmacy", color: C.pharmacy, bg: C.pharmacyLight, route: "/pharmacy" as Href },
    ],
    tabLabel: "Pharmacy",
    adminDescription: "On-demand medicine delivery with prescriptions",
    adminIcon: "💊",
  },

  van: {
    key: "van",
    featureFlag: "feature_van",
    label: "Van Service",
    description: "Intercity shared van booking across AJK",
    icon: "bus-outline",
    iconFocused: "bus",
    route: "/van" as Href,
    color: C.brandBlue,
    colorLight: C.brandBlueSoft,
    gradient: [C.brandBlueSoft, "#CCE0FF"],
    cardGradient: [C.brandBlueSoft, "#CCE0FF"],
    iconGradient: [C.brandBlue, "#5599FF"],
    textColor: "#003380",
    tagColor: "#003380",
    tagBg: "#99BBFF",
    tag: "Intercity",
    tagIcon: "bus-outline",
    heroConfig: {
      badgeIcon: "bus",
      badgeLabel: "Van Service",
      title: "Van",
      subtitle: "Intercity shared van booking\nacross AJK",
      stats: [
        { icon: "bus-outline", label: "Shared seats" },
        { icon: "map-outline", label: "Intercity routes" },
      ],
      cta: "Book Seat",
      gradient: [C.brandBlueDark, C.brandBlue, "#5599FF"],
    },
    banners: [
      {
        title: "Van Service",
        desc: "Book shared van seats for intercity travel across AJK!",
        tag: "Intercity",
        c1: C.brandBlueDark,
        c2: C.brandBlue,
        icon: "bus-outline",
        cta: "Book Seat",
      },
    ],
    quickActions: [
      { icon: "bus-outline", label: "Van", color: C.brandBlue, bg: C.brandBlueSoft, route: "/van" as Href },
    ],
    tabLabel: "Van",
    adminDescription: "Intercity shared van booking service across AJK",
    adminIcon: "🚌",
  },

  school: {
    key: "school",
    featureFlag: "feature_school",
    label: "School Transport",
    description: "Safe & scheduled school transport for students",
    icon: "school-outline",
    iconFocused: "school",
    route: "/school" as Href,
    color: C.emerald,
    colorLight: C.emeraldSoft,
    gradient: [C.emeraldSoft, "#CCFFE8"],
    cardGradient: [C.emeraldSoft, "#CCFFE8"],
    iconGradient: [C.emerald, "#33E8A0"],
    textColor: "#003D22",
    tagColor: "#003D22",
    tagBg: "#99FFCC",
    tag: "Scheduled",
    tagIcon: "school-outline",
    heroConfig: {
      badgeIcon: "school",
      badgeLabel: "School Transport",
      title: "School",
      subtitle: "Safe & scheduled transport\nfor students",
      stats: [
        { icon: "school-outline", label: "Safe for kids" },
        { icon: "time-outline", label: "On schedule" },
      ],
      cta: "Subscribe",
      gradient: [C.emeraldDark, C.emerald, "#33E8A0"],
    },
    banners: [
      {
        title: "School Transport",
        desc: "Safe & scheduled school transport for your children!",
        tag: "Safe Rides",
        c1: C.emeraldDark,
        c2: C.emerald,
        icon: "school-outline",
        cta: "Subscribe",
      },
    ],
    quickActions: [
      { icon: "school-outline", label: "School", color: C.emerald, bg: C.emeraldSoft, route: "/school" as Href },
    ],
    tabLabel: "School",
    adminDescription: "Scheduled school transport subscription service",
    adminIcon: "🏫",
  },

  parcel: {
    key: "parcel",
    featureFlag: "feature_parcel",
    label: "Parcel Delivery",
    description: "Send parcels anywhere in AJK",
    icon: "cube-outline",
    iconFocused: "cube",
    route: "/parcel" as Href,
    color: C.parcel,
    colorLight: C.parcelLight,
    gradient: [C.parcelLight, "#FFD9CC"],
    cardGradient: [C.parcelLight, "#FFD9CC"],
    iconGradient: [C.parcel, "#FF8F66"],
    textColor: "#8C3300",
    tagColor: "#8C3300",
    tagBg: "#FFBFA3",
    tag: "Rs. 150+",
    tagIcon: "cube-outline",
    heroConfig: {
      badgeIcon: "cube",
      badgeLabel: "Parcel Delivery",
      title: "Parcel",
      subtitle: "Send parcels anywhere in AJK\nstarting from Rs. 150",
      stats: [
        { icon: "cube-outline", label: "Any size" },
        { icon: "time-outline", label: "Same day" },
      ],
      cta: "Book Now",
      gradient: ["#E65500", C.parcel, "#FF8F66"],
    },
    banners: [
      {
        title: "Parcel Delivery",
        desc: "Send parcels anywhere in AJK — starting from Rs. 150!",
        tag: "Fast Delivery",
        c1: "#E65500",
        c2: C.parcel,
        icon: "cube-outline",
        cta: "Book Now",
      },
    ],
    quickActions: [
      { icon: "cube-outline", label: "Parcel", color: C.parcel, bg: C.parcelLight, route: "/parcel" as Href },
    ],
    tabLabel: "Parcel",
    adminDescription: "Same-day parcel & package delivery across AJK",
    adminIcon: "📦",
  },
};


export const GLOBAL_QUICK_ACTIONS: Array<{
  icon: IoniconName;
  label: string;
  color: string;
  bg: string;
  route: Href;
  service: ServiceKey | null;
}> = [
  { icon: "time-outline", label: "Track", color: C.primary, bg: C.primarySoft, route: "/(tabs)/orders" as Href, service: null },
];

export function getActiveServices(
  features: Record<string, boolean | undefined>,
): ServiceDefinition[] {
  return SERVICE_KEYS.filter((k) => features[k]).map((k) => SERVICE_REGISTRY[k]);
}

export function getActiveBanners(features: Record<string, boolean | undefined>) {
  const active = getActiveServices(features);
  return active.flatMap((svc) =>
    svc.banners.map((b) => ({
      ...b,
      route: svc.route,
      service: svc.key,
    })),
  );
}

export function getActiveQuickActions(features: Record<string, boolean>) {
  const active = getActiveServices(features);
  const serviceActions = active.flatMap((svc) =>
    svc.quickActions.map((qa) => ({ ...qa, service: svc.key as ServiceKey | null })),
  );
  const globalActions = active.length > 0 ? GLOBAL_QUICK_ACTIONS : [];
  return [...serviceActions, ...globalActions];
}

