import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  findNearbyClubs,
  searchLocations,
  type GolfClub,
  type LocationSuggestion,
} from "../api/nearbyClubs";
import VendorTabs from "../components/VendorTabs";

export default function NearbyClubsPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubs, setClubs] = useState<GolfClub[] | null>(null);
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
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlaceId) return;
    setLoading(true);
    setError(null);
    setClubs(null);
    try {
      const res = await findNearbyClubs(selectedPlaceId, radiusKm);
      setClubs(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">
            Nearby Clubs
          </h1>
          <p className="text-sm text-gray-600">
            Pick a location and a radius to find nearby golf courses (top 10
            from Google Places).
          </p>
        </header>

        <VendorTabs />

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700">
              Location
            </label>
            <input
              type="text"
              required
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedPlaceId(null);
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() =>
                setTimeout(() => setShowSuggestions(false), 150)
              }
              placeholder="Start typing a city or area..."
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
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Radius (km)
            </label>
            <input
              type="number"
              required
              min={1}
              max={50}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="mt-1 block w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !selectedPlaceId}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loading ? "Searching..." : "Find clubs"}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {clubs && !error && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {clubs.length === 0 ? (
              <p className="p-6 text-sm text-gray-600">
                No golf courses found within {radiusKm} km.
              </p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Address
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Website
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clubs.map((c) => (
                    <tr key={c.place_id}>
                      <td className="px-4 py-2 text-gray-900">{c.name}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {c.address ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        {c.website ? (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-blue-600 underline hover:text-blue-800"
                          >
                            {c.website}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
