import type { LatLng } from "../../types/golf";

// Approximate metres between two lat/lng points (equirectangular — fine at hole scale).
export function metresBetween(a: LatLng, b: LatLng): number {
  const dlat = (b.lat - a.lat) * 111320;
  const dlng = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

// Total length of a polyline of nodes, in metres.
export function arcLength(nodes: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < nodes.length; i++) total += metresBetween(nodes[i - 1], nodes[i]);
  return total;
}

// Compass bearing (degrees clockwise from north) from one point to another.
export function bearingBetween(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
