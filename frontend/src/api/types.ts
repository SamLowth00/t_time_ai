export type TeeTime = {
  time: string;
  price: string | null;
  booking_url: string | null;
};

export type GolfClub = {
  place_id: string;
  name: string;
  address: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
};

export type LocationSuggestion = {
  place_id: string;
  label: string;
};

// What the LocationPicker hands back: either an autocomplete pick (place_id)
// or the browser's current location (lat/lng).
export type LocationSelection =
  | { kind: "place"; place_id: string; label: string }
  | { kind: "coords"; lat: number; lng: number; label: string };
