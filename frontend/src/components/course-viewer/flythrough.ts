import type { GolfHole } from "../../types/golf";
import { bearingBetween, metresBetween } from "./geometry";
import { FLY_RANGE, FLY_TILT } from "./constants";
import type { GmpMap3dElement } from "./mapElement";

// Drive the fly-through ourselves with requestAnimationFrame so tilt + range stay exactly
// constant the whole flight. flyCameraTo's own animation is parabolic — it arcs tilt/range
// between endpoints — so instead we walk a bit further along the fairway each frame and
// snap the camera with durationMillis: 0 (the no-reconciliation path), holding tilt/range
// fixed. Only center + heading change, linearly. Returns a cancel fn.
export function startFlyThrough(
  map: GmpMap3dElement,
  hole: GolfHole,
  groundAlt: number
): () => void {
  const nodes = hole.wayNodes;
  if (nodes.length < 2) return () => {};
  if (typeof (map as unknown as Record<string, unknown>).flyCameraTo !== "function") return () => {};

  // Cumulative segment lengths along the fairway.
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < nodes.length; i++) {
    const d = metresBetween(nodes[i - 1], nodes[i]);
    segLens.push(d);
    total += d;
  }
  if (total === 0) return () => {};

  const duration = Math.max(2000, total * 60); // ms — roughly the previous pace
  let rafId = 0;
  let startTs = 0;
  let cancelled = false;

  const frame = (now: number) => {
    if (cancelled) return;
    if (!startTs) startTs = now;
    const p = Math.min(1, (now - startTs) / duration);
    const distAlong = p * total;

    // Find the segment containing distAlong and interpolate within it.
    let acc = 0;
    let i = 0;
    while (i < segLens.length - 1 && acc + segLens[i] < distAlong) {
      acc += segLens[i];
      i++;
    }
    const from = nodes[i];
    const to = nodes[i + 1] ?? nodes[i];
    const frac = segLens[i] ? (distAlong - acc) / segLens[i] : 0;
    const lat = from.lat + (to.lat - from.lat) * frac;
    const lng = from.lng + (to.lng - from.lng) * frac;

    map.flyCameraTo({
      endCamera: {
        center: { lat, lng, altitude: groundAlt },
        heading: bearingBetween(from, to),
        tilt: FLY_TILT,
        range: FLY_RANGE,
      },
      durationMillis: 0,
    });

    if (p < 1) rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
