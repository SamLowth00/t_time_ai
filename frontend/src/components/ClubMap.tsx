import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L, { type LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GolfClub, TeeTime } from "../api/types";

type SuccessfulClub = {
  place_id: string;
  tee_times: TeeTime[];
};

// A dark teardrop pin (inline SVG, no image asset) marking the search origin,
// clearly distinct from the colour-coded club dots.
const ORIGIN_ICON = L.divIcon({
  className: "",
  html: `
    <svg width="26" height="34" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z"
            fill="#111827" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="#ffffff"/>
    </svg>`,
  iconSize: [26, 34],
  iconAnchor: [13, 34],
  tooltipAnchor: [0, -30],
});

// Re-fit the viewport whenever the set of points changes (clubs stream in over
// the life of a search). `points` is memoised on the club set + centre, so
// selection toggles don't trigger a refit.
function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export default function ClubMap({
  successful,
  clubs,
  enabled,
  colorFor,
  onMarkerClick,
  center,
  centerLabel,
}: {
  successful: SuccessfulClub[];
  clubs: Record<string, GolfClub>;
  enabled: Record<string, boolean>;
  colorFor: Record<string, string>;
  onMarkerClick: (placeId: string) => void;
  center: { lat: number; lng: number } | null;
  centerLabel: string | null;
}) {
  // Only successful clubs we have coordinates for can be pinned.
  const pins = useMemo(
    () =>
      successful.flatMap((s) => {
        const club = clubs[s.place_id];
        if (!club || club.lat == null || club.lng == null) return [];
        return [
          {
            place_id: s.place_id,
            name: club.name,
            count: s.tee_times.length,
            pos: [club.lat, club.lng] as LatLngTuple,
          },
        ];
      }),
    [successful, clubs],
  );

  // Bounds cover every club pin plus the search origin so it's always visible.
  const points = useMemo(() => {
    const pts = pins.map((p) => p.pos);
    if (center) pts.push([center.lat, center.lng]);
    return pts;
  }, [pins, center]);

  if (pins.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
        Map ({pins.length})
      </div>
      <div className="relative z-0 h-80">
        <MapContainer
          className="h-full w-full"
          center={points[0]}
          zoom={11}
          scrollWheelZoom={false}
        >
          {/* CARTO Positron — clean, low-detail light basemap (free, no key). */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
          />
          <FitBounds points={points} />
          {center && (
            <Marker position={[center.lat, center.lng]} icon={ORIGIN_ICON}>
              <Tooltip direction="top">
                <span className="font-medium">{centerLabel ?? "Search area"}</span>
              </Tooltip>
            </Marker>
          )}
          {pins.map((p) => {
            const on = enabled[p.place_id] !== false;
            const color = colorFor[p.place_id] ?? "#2563eb";
            return (
              <CircleMarker
                key={p.place_id}
                center={p.pos}
                radius={on ? 9 : 6}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2,
                  fillColor: color,
                  fillOpacity: on ? 0.95 : 0.3,
                  opacity: on ? 1 : 0.4,
                }}
                eventHandlers={{ click: () => onMarkerClick(p.place_id) }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-gray-500">
                    {" · "}
                    {p.count} tee time{p.count === 1 ? "" : "s"}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
        Click a pin to show only that course; click more to add others.
      </p>
    </div>
  );
}
