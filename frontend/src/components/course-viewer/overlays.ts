import type { GolfHole } from "../../types/golf";

// Draw the hole's way polyline + Tee/Pin markers on the map, replacing any previous ones.
export function syncOverlays(map: HTMLElement, hole: GolfHole) {
  map.querySelectorAll("gmp-polyline-3d, gmp-marker-3d").forEach((el) => el.remove());

  const line = document.createElement("gmp-polyline-3d");
  (line as unknown as { coordinates: object[] }).coordinates = hole.wayNodes.map((n) => ({
    lat: n.lat, lng: n.lng, altitude: 0,
  }));
  line.setAttribute("altitude-mode", "CLAMP_TO_GROUND");
  line.setAttribute("stroke-color", "rgba(255,255,255,0.85)");
  line.setAttribute("stroke-width", "4");
  map.appendChild(line);

  for (const [pos, label] of [[hole.tee, "Tee"], [hole.greenEnd, "Pin"]] as const) {
    const m = document.createElement("gmp-marker-3d");
    (m as unknown as { position: object }).position = { lat: pos.lat, lng: pos.lng, altitude: 0 };
    m.setAttribute("altitude-mode", "CLAMP_TO_GROUND");
    m.setAttribute("label", label);
    map.appendChild(m);
  }
}
