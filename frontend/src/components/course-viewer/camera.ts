import type { GolfHole, LatLng } from "../../types/golf";
import { arcLength, bearingBetween } from "./geometry";
import { FLY_RANGE } from "./constants";
import type { GmpMap3dElement } from "./mapElement";

// The initial top-down framing for a hole, centred on the tee.
function staticCamera(hole: GolfHole) {
  const nodes = hole.wayNodes;
  const len = arcLength(nodes);
  // Aim along the first segment of the way (the fairway's initial direction) rather than
  // straight at the green — differs on doglegs. Fall back to bearingToGreen if no segment.
  const heading = nodes.length >= 2 ? bearingBetween(nodes[0], nodes[1]) : hole.bearingToGreen;
  return {
    center: { lat: hole.tee.lat, lng: hole.tee.lng, altitude: 0 },
    tilt: 0,
    heading,
    range: Math.max(250, len * 2),
  };
}

// Apply the static top-down framing via the declarative camera properties.
export function setCamera(map: GmpMap3dElement, hole: GolfHole) {
  const p = staticCamera(hole);
  map.center = p.center;
  map.tilt = p.tilt;
  map.heading = p.heading;
  map.range = p.range;
}

// Mirrors the built-in tilt control: change ONLY the tilt, anchoring the look-at to the
// hole's tee at the real ground elevation, so (a) the element can't drift the center as it
// reconciles the camera on tilt, and (b) a tight range doesn't put the camera below the
// terrain (which clamps range to 0). durationMillis: 0 snaps with no parabolic reconcile.
export function tiltCameraBy(map: GmpMap3dElement, delta: number, groundAlt: number, tee: LatLng) {
  const tilt = Math.min(90, Math.max(0, (map.tilt ?? 0) + delta));
  map.flyCameraTo({
    endCamera: {
      center: { lat: tee.lat, lng: tee.lng, altitude: groundAlt },
      heading: map.heading,
      tilt,
      range: FLY_RANGE,
    },
    durationMillis: 0,
  });
}
