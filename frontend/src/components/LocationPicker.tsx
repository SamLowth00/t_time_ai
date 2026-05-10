import { useEffect, useRef, useState } from "react";
import { searchLocations } from "../api/nearbyClubs";
import type { LocationSuggestion } from "../api/types";

type Props = {
  onSelect: (suggestion: LocationSuggestion | null) => void;
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
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selectedPlaceId) return;
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
  }, [query, selectedPlaceId]);

  function pickSuggestion(s: LocationSuggestion) {
    setSelectedPlaceId(s.place_id);
    setQuery(s.label);
    setShowSuggestions(false);
    onSelect(s);
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        required
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selectedPlaceId) {
            setSelectedPlaceId(null);
            onSelect(null);
          }
        }}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
  );
}
