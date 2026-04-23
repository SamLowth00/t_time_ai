export type Vendor = "clubv1" | "chronogolf" | "brsgolf" | "intelligentgolf";

export type WebcrawlerResponse = {
  booking_url: string | null;
  vendor: Vendor | null;
  pages_crawled: number;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function discoverBookingUrl(
  url: string,
): Promise<WebcrawlerResponse> {
  const res = await fetch(`${API_URL}/webcrawler`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }

  return (await res.json()) as WebcrawlerResponse;
}
