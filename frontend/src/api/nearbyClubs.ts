import type { LocationSuggestion } from "./types";

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
