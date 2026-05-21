import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import {
  startJob,
  subscribeToJob,
  type DiscoveryEvent,
  type JobDoneReason,
  type UnsuccessfulReason,
  type Vendor,
} from "../api/discovery";
import type { GolfClub, TeeTime } from "../api/types";
import LocationPicker from "../components/LocationPicker";
import TeeTimeResults from "../components/TeeTimeResults";

type ScanStatus = "finding_booking_url" | "fetching_tee_times";

type SuccessRow = {
  place_id: string;
  booking_url: string;
  vendor: Vendor;
  tee_times: TeeTime[];
};

type FailureRow = {
  place_id: string;
  reason: UnsuccessfulReason;
  detail: string | null;
};

type State = {
  clubs: Record<string, GolfClub>;
  scanning: Record<string, ScanStatus>;
  successful: SuccessRow[];
  unsuccessful: FailureRow[];
  done: boolean;
  doneReason: JobDoneReason | null;
};

const initialState: State = {
  clubs: {},
  scanning: {},
  successful: [],
  unsuccessful: [],
  done: false,
  doneReason: null,
};

function reduce(state: State, event: DiscoveryEvent): State {
  switch (event.type) {
    case "clubs_found": {
      const clubs: Record<string, GolfClub> = {};
      for (const c of event.clubs) clubs[c.place_id] = c;
      return { ...initialState, clubs };
    }
    case "club_started":
      return {
        ...state,
        scanning: { ...state.scanning, [event.place_id]: "finding_booking_url" },
      };
    case "club_booking_found":
      return {
        ...state,
        scanning: { ...state.scanning, [event.place_id]: "fetching_tee_times" },
      };
    case "club_succeeded": {
      const { [event.place_id]: _, ...scanning } = state.scanning;
      return {
        ...state,
        scanning,
        successful: [
          ...state.successful,
          {
            place_id: event.place_id,
            booking_url: event.booking_url,
            vendor: event.vendor,
            tee_times: event.tee_times,
          },
        ],
      };
    }
    case "club_unsuccessful": {
      const { [event.place_id]: _, ...scanning } = state.scanning;
      return {
        ...state,
        scanning,
        unsuccessful: [
          ...state.unsuccessful,
          {
            place_id: event.place_id,
            reason: event.reason,
            detail: event.detail,
          },
        ],
      };
    }
    case "done":
      return { ...state, done: true, doneReason: event.reason };
  }
}

const REASON_COPY: Record<UnsuccessfulReason, string> = {
  no_website: "No website on Google",
  no_booking_url: "No recognised booking link found",
  unsupported_vendor: "Uses an unsupported booking vendor",
  scrape_failed: "Scrape failed",
  robots_disallowed: "Crawling not allowed by robots.txt",
};

const STATUS_COPY: Record<ScanStatus, string> = {
  finding_booking_url: "Finding booking link…",
  fetching_tee_times: "Fetching tee times…",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DiscoverPage() {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(20);
  const [date, setDate] = useState(todayIso());
  const [players, setPlayers] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(reduce, initialState);
  const [hasJob, setHasJob] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlaceId) return;
    setError(null);
    setSubmitting(true);
    unsubscribeRef.current?.();
    dispatch({ type: "clubs_found", clubs: [] });
    try {
      const { job_id } = await startJob({
        place_id: selectedPlaceId,
        radius_km: radiusKm,
        date,
        players,
      });
      setHasJob(true);
      unsubscribeRef.current = subscribeToJob(job_id, (event) => {
        dispatch(event);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const scanningEntries = Object.entries(state.scanning);
  const totalKnown =
    scanningEntries.length + state.successful.length + state.unsuccessful.length;
  const totalClubs = Object.keys(state.clubs).length;
  const showResults = hasJob && (totalClubs > 0 || state.done);

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">Discover</h1>
          <p className="text-sm text-gray-600">
            Find tee times across every nearby club in one go. Picks the 10
            nearest clubs from Google Places, finds each one's booking
            provider, and fetches tee times concurrently.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <LocationPicker
            onSelect={(s) => setSelectedPlaceId(s?.place_id ?? null)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Players
              </label>
              <input
                type="number"
                required
                min={1}
                max={4}
                value={players}
                onChange={(e) => setPlayers(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || !selectedPlaceId}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? "Starting…" : "Discover tee times"}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {showResults && (
          <>
            {totalClubs > 0 && (
              <div className="text-sm text-gray-600">
                {state.done
                  ? state.doneReason === "target_reached"
                    ? `Found ${state.successful.length} successful clubs (target reached).`
                    : `Searched all ${totalClubs} candidate clubs in radius — ${state.successful.length} successful.`
                  : `Searching up to ${totalClubs} clubs (${totalKnown} resolved)…`}
              </div>
            )}

            <Section
              title="Scanning"
              count={scanningEntries.length}
              empty={state.done ? "Nothing in flight." : "Waiting…"}
              scroll
            >
              {scanningEntries.map(([placeId, status]) => (
                <div
                  key={placeId}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <div>
                    <div className="font-medium text-gray-900">
                      {state.clubs[placeId]?.name ?? placeId}
                    </div>
                    <div className="text-xs text-gray-500">
                      {STATUS_COPY[status]}
                    </div>
                  </div>
                </div>
              ))}
            </Section>

            <Section
              title="Successful"
              count={state.successful.length}
              empty="None yet."
            >
              <TeeTimeResults rows={state.successful} clubs={state.clubs} />
            </Section>

            <Section
              title="Unsuccessful"
              count={state.unsuccessful.length}
              empty="None."
            >
              {state.unsuccessful.map((row) => (
                <div key={row.place_id} className="px-4 py-3 text-sm">
                  <div className="font-medium text-gray-900">
                    {state.clubs[row.place_id]?.name ?? row.place_id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {REASON_COPY[row.reason]}
                    {row.detail ? ` — ${row.detail}` : ""}
                  </div>
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  scroll = false,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
        {title} ({count})
      </div>
      {count === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500 italic">{empty}</p>
      ) : (
        <div
          className={`divide-y divide-gray-100${
            scroll ? " max-h-72 overflow-y-auto" : ""
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
