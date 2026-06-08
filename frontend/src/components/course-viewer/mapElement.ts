// The Google Photorealistic 3D Maps web component (gmp-map-3d) — only the bits we use.
export interface GmpMap3dElement extends HTMLElement {
  center: { lat: number; lng: number; altitude: number };
  cameraPosition?: { lat: number; lng: number; altitude: number };
  tilt: number;
  heading: number;
  range: number;
  flyCameraTo(opts: {
    endCamera: {
      center: { lat: number; lng: number; altitude: number };
      tilt: number;
      heading: number;
      range: number;
    };
    durationMillis: number;
  }): void;
}

let mapsReadyPromise: Promise<void> | null = null;

// Lazy-load the Maps JS API (maps3d library) once; resolves when gmp-map-3d is defined.
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsReadyPromise) return mapsReadyPromise;
  mapsReadyPromise = new Promise<void>((resolve) => {
    if (customElements.get("gmp-map-3d")) { resolve(); return; }
    const callbackName = "__gmpMaps3dReady";
    (window as unknown as Record<string, unknown>)[callbackName] = () => resolve();
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=alpha&libraries=maps3d&callback=${callbackName}`;
    document.head.appendChild(script);
  });
  return mapsReadyPromise;
}
