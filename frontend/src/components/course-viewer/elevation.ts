import type { LatLng } from "../../types/golf";

interface ElevationResultLike {
  elevation: number;
}
interface ElevationServiceLike {
  getElevationForLocations(req: { locations: LatLng[] }): Promise<{ results: ElevationResultLike[] }>;
}
interface ElevationLib {
  ElevationService: new () => ElevationServiceLike;
}

// Ground elevation (metres above sea level) at a point, used so the camera can hold a
// constant height above terrain rather than diving through it. Falls back to 0 on failure.
export async function resolveGroundAltitude(point: LatLng): Promise<number> {
  try {
    const g = (window as unknown as {
      google: { maps: { importLibrary(name: string): Promise<ElevationLib> } };
    }).google;
    const { ElevationService } = await g.maps.importLibrary("elevation");
    const { results } = await new ElevationService().getElevationForLocations({
      locations: [{ lat: point.lat, lng: point.lng }],
    });
    return results?.[0]?.elevation ?? 0;
  } catch {
    return 0;
  }
}
