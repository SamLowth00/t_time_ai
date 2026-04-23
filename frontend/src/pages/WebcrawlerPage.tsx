import { useState, type FormEvent } from "react";
import {
  discoverBookingUrl,
  type WebcrawlerResponse,
} from "../api/webcrawler";
import VendorTabs from "../components/VendorTabs";

const VENDOR_LABEL: Record<string, string> = {
  clubv1: "ClubV1",
  chronogolf: "Chronogolf",
  brsgolf: "BRS Golf",
  intelligentgolf: "IntelligentGolf",
};

export default function WebcrawlerPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebcrawlerResponse | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await discoverBookingUrl(url);
      setResult(res);
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
            WebCrawler test
          </h1>
          <p className="text-sm text-gray-600">
            Paste a golf club's website URL. The crawler walks the site looking
            for a link to a known booking vendor (ClubV1, Chronogolf, BRS Golf,
            IntelligentGolf).
          </p>
        </header>

        <VendorTabs />

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Golf club URL
            </label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.examplegolfclub.com"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {loading ? "Crawling..." : "Find booking URL"}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && !error && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {result.booking_url ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                    {result.vendor
                      ? VENDOR_LABEL[result.vendor] ?? result.vendor
                      : "Unknown vendor"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {result.pages_crawled}{" "}
                    {result.pages_crawled === 1 ? "page" : "pages"} crawled
                  </span>
                </div>
                <a
                  href={result.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all text-sm text-blue-600 underline hover:text-blue-800"
                >
                  {result.booking_url}
                </a>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  No booking site found
                </p>
                <p className="text-xs text-gray-500">
                  {result.pages_crawled}{" "}
                  {result.pages_crawled === 1 ? "page" : "pages"} crawled
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
