import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { GolfHole } from "../../types/golf";
import { FLY_TILT } from "./constants";
import { setCamera, tiltCameraBy } from "./camera";
import { resolveGroundAltitude } from "./elevation";
import { startFlyThrough } from "./flythrough";
import { loadGoogleMaps, type GmpMap3dElement } from "./mapElement";
import { syncOverlays } from "./overlays";

export interface CourseViewerHandle {
  flyThrough: () => void;
}

interface Props {
  googleApiKey: string;
  hole: GolfHole;
  onCameraChange?: (state: { tilt: number; heading: number; range: number; center: { lat: number; lng: number } }) => void;
}

const CourseViewer = forwardRef<CourseViewerHandle, Props>(function CourseViewer(
  { googleApiKey, hole, onCameraChange },
  ref
) {
  const mapRef = useRef<GmpMap3dElement>(null);
  const readyRef = useRef(false);
  const holeRef = useRef(hole);
  const flyCancelRef = useRef<(() => void) | null>(null);
  const groundAltRef = useRef(0);
  holeRef.current = hole;

  function clearFly() {
    flyCancelRef.current?.();
    flyCancelRef.current = null;
  }

  // Drop into the standard tee view for a hole: static top-down camera + overlays, then
  // (once terrain height resolves so we don't dip below ground) tilt up into the tee shot.
  function applyTeeView(map: GmpMap3dElement, h: GolfHole) {
    setCamera(map, h);
    syncOverlays(map, h);
    resolveGroundAltitude(h.tee).then((a) => {
      groundAltRef.current = a;
      tiltCameraBy(map, FLY_TILT, a, h.tee);
    });
  }

  useImperativeHandle(ref, () => ({
    flyThrough() {
      const map = mapRef.current;
      if (!map || !readyRef.current) return;
      clearFly();
      flyCancelRef.current = startFlyThrough(map, holeRef.current, groundAltRef.current);
    },
  }));

  // Runs once: load the API, then set camera + overlays on the now-stable element.
  useEffect(() => {
    loadGoogleMaps(googleApiKey).then(() => {
      readyRef.current = true;
      const map = mapRef.current;
      if (!map) return;
      applyTeeView(map, holeRef.current);

      const notify = () =>
        onCameraChange?.({ tilt: map.tilt, heading: map.heading, range: map.range, center: { lat: map.center.lat, lng: map.center.lng } });
      map.addEventListener("gmp-tiltchange", notify);
      map.addEventListener("gmp-headingchange", notify);
      map.addEventListener("gmp-rangechange", notify);
      map.addEventListener("gmp-centerchange", notify);
    });
    return () => clearFly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleApiKey]);

  // Runs on every hole change: element stays mounted so it is always ready.
  useEffect(() => {
    if (!readyRef.current) return;
    clearFly();
    const map = mapRef.current;
    if (!map) return;
    applyTeeView(map, hole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole]);

  return (
    // @ts-expect-error gmp-map-3d is not in React's JSX intrinsic elements
    <gmp-map-3d
      ref={mapRef}
      mode="SATELLITE"
      // pointer-events: none disables all user map gestures (pan/zoom/rotate/tilt) so the
      // only camera movement is our scripted fly-through; overlay buttons are separate
      // elements and keep working.
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
});

export default CourseViewer;
