import type { GolfClub, TeeTime } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type Vendor = "clubv1" | "chronogolf" | "brsgolf" | "intelligentgolf" | "golfmanager";
export type UnsuccessfulReason =
  | "no_website"
  | "no_booking_url"
  | "unsupported_vendor"
  | "scrape_failed"
  | "robots_disallowed";
export type JobDoneReason = "target_reached" | "exhausted";

export type DiscoveryEvent =
  | {
      type: "clubs_found";
      clubs: GolfClub[];
      center_lat: number | null;
      center_lng: number | null;
    }
  | { type: "club_started"; place_id: string }
  | {
      type: "club_booking_found";
      place_id: string;
      booking_url: string;
      vendor: Vendor;
    }
  | {
      type: "club_succeeded";
      place_id: string;
      booking_url: string;
      vendor: Vendor;
      tee_times: TeeTime[];
    }
  | {
      type: "club_unsuccessful";
      place_id: string;
      reason: UnsuccessfulReason;
      detail: string | null;
    }
  | { type: "done"; reason: JobDoneReason; successful: number };

export type DiscoverRequest = {
  place_id?: string;
  lat?: number;
  lng?: number;
  radius_km: number;
  date: string;
  players: number;
};

export async function startJob(req: DiscoverRequest): Promise<{ job_id: string }> {
  const res = await fetch(`${API_URL}/discover-tee-times`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const minutes = retryAfter ? Math.ceil(Number(retryAfter) / 60) : null;
      throw new Error(
        minutes
          ? `You've made too many searches. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
          : "You've made too many searches. Please try again later.",
      );
    }
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export function subscribeToJob(
  jobId: string,
  onEvent: (event: DiscoveryEvent) => void,
): () => void {
  const source = new EventSource(`${API_URL}/discover-tee-times/${jobId}/events`);
  source.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as DiscoveryEvent;
      onEvent(parsed);
      if (parsed.type === "done") source.close();
    } catch {
      // ignore malformed frames
    }
  };
  source.onerror = () => {
    // Browser auto-retries by default. We don't surface errors here;
    // closing the EventSource on `done` is the canonical end signal.
  };
  return () => source.close();
}
