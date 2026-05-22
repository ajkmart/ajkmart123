/** Typed response shapes for third-party geocoding / routing APIs. */

export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    road?: string;
    suburb?: string;
    village?: string;
    city?: string;
    town?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  address_components?: Array<{ long_name: string; types: string[] }>;
}

export interface LocationIQAutocompleteResult {
  place_id?: string;
  osm_id?: string;
  display_name?: string;
  address?: {
    road?: string;
    suburb?: string;
    village?: string;
    city?: string;
    town?: string;
    county?: string;
  };
  lat?: string;
  lon?: string;
}

export interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    geometry: {
      location: { lat: number; lng: number };
    };
    formatted_address: string;
    address_components: Array<{ long_name: string; types: string[] }>;
    place_id: string;
  }>;
  error_message?: string;
}

export interface GoogleAutocompleteResponse {
  status: string;
  predictions: Array<{
    place_id: string;
    description: string;
    structured_formatting?: {
      main_text: string;
      secondary_text: string;
    };
  }>;
}

export interface GoogleDirectionsResponse {
  status: string;
  routes: Array<{
    legs: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }>;
    overview_polyline?: { points: string };
  }>;
}

export interface MapboxDirectionsResponse {
  routes: Array<{
    distance: number;
    duration: number;
    geometry?: unknown;
  }>;
}

export interface GoogleMapsDistanceMatrixResponse {
  status: string;
  rows: Array<{
    elements: Array<{
      status: string;
      distance?: { value: number; text: string };
      duration?: { value: number; text: string };
    }>;
  }>;
}

export interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    code?: number;
  };
}

export interface FcmLegacyResponse {
  success?: number;
  failure?: number;
  results?: Array<{ message_id?: string; error?: string }>;
  error?: { message?: string } | string;
  raw?: string;
}
