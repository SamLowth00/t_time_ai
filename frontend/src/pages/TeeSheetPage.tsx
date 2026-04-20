import { useState, type FormEvent } from "react";
import { fetchTeeTimes, type TeeTime } from "../api/clubv1";
import TeeTimeTable from "../components/TeeTimeTable";

export default function TeeSheetPage() {
  const [url, setUrl] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teeTimes, setTeeTimes] = useState<TeeTime[] | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTeeTimes(null);
    try {
      const results = await fetchTeeTimes(url, date);
      setTeeTimes(results);
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
            Tee Time Finder
          </h1>
          <p className="text-sm text-gray-600">
            Paste a ClubV1 tee-sheet URL and pick a date.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tee sheet URL
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.hub.clubv1.com/Visitors/TeeSheet"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loading ? "Searching..." : "Find tee times"}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {teeTimes !== null && !error && <TeeTimeTable teeTimes={teeTimes} />}
      </div>
    </div>
  );
}
