export type LocationSuggestion = {
  place_id: string;
  label: string;
};

export type GolfClub = {
  place_id: string;
  name: string;
  address: string | null;
  website: string | null;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function searchLocations(
  q: string,
): Promise<LocationSuggestion[]> {
  const res = await fetch(
    `${API_URL}/nearby-clubs/locations?q=${encodeURIComponent(q)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  const data = (await res.json()) as { suggestions: LocationSuggestion[] };
  return data.suggestions;
}

export async function findNearbyClubs(
  placeId: string,
  radiusKm: number,
): Promise<GolfClub[]> {
  const res = await fetch(`${API_URL}/nearby-clubs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_id: placeId, radius_km: radiusKm }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  const data = (await res.json()) as { clubs: GolfClub[] };
  return data.clubs;
}
