import { useEffect, useRef, useState } from "react";
import { searchLocations } from "../api/nearbyClubs";
import type { LocationSelection, LocationSuggestion } from "../api/types";

type Props = {
  onSelect: (selection: LocationSelection | null) => void;
  label?: string;
  placeholder?: string;
};

export default function LocationPicker({
  onSelect,
  label = "Location",
  placeholder = "Start typing a city or area...",
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // True once a place or current-location has been chosen — suppresses
  // autocomplete until the user edits the field again.
  const [hasSelection, setHasSelection] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (hasSelection) return;
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchLocations(query);
        setSuggestions(res);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, hasSelection]);

  function pickSuggestion(s: LocationSuggestion) {
    setHasSelection(true);
    setQuery(s.label);
    setShowSuggestions(false);
    setGeoError(null);
    onSelect({ kind: "place", place_id: s.place_id, label: s.label });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation isn't supported by this browser.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setHasSelection(true);
        setQuery("Current location");
        setSuggestions([]);
        setShowSuggestions(false);
        onSelect({
          kind: "coords",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Current location",
        });
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — allow it or type an area instead."
            : "Couldn't get your location. Try typing an area instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1 flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (hasSelection) {
                setHasSelection(false);
                onSelect(null);
              }
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={placeholder}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
              {suggestions.map((s) => (
                <li key={s.place_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickSuggestion(s);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          title="Use your current location"
          className="shrink-0 whitespace-nowrap rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {locating ? "Locating…" : "📍 My location"}
        </button>
      </div>
      {geoError && <p className="mt-1 text-xs text-red-600">{geoError}</p>}
    </div>
  );
}
