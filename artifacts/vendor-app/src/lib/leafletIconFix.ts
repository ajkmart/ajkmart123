import L from "leaflet";

type LeafletIconProto = L.Icon.Default & { _getIconUrl?: string };

export function patchLeafletDefaultIcon(): void {
  delete (L.Icon.Default.prototype as LeafletIconProto)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}
