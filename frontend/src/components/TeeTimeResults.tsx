import { useEffect, useMemo, useState } from "react";
import type { GolfClub, TeeTime } from "../api/types";

export type SuccessfulClub = {
  place_id: string;
  tee_times: TeeTime[];
};

const DAY_START = 0; // 00:00 in minutes
const DAY_END = 1440; // 24:00 in minutes
const STEP = 15;

// Distinct colours so each course can be visually linked between the
// filter checkboxes and its rows in the merged table.
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#65a30d",
  "#c026d3",
  "#0d9488",
];

function parseMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatMinutes(total: number): string {
  if (total >= DAY_END) return "24:00";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function TeeTimeResults({
  rows,
  clubs,
}: {
  rows: SuccessfulClub[];
  clubs: Record<string, GolfClub>;
}) {
  // Which courses are shown. New courses stream in over time and default to on.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [range, setRange] = useState<[number, number]>([DAY_START, DAY_END]);

  useEffect(() => {
    setEnabled((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of rows) {
        if (!(row.place_id in next)) {
          next[row.place_id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const colorFor = useMemo(() => {
    const map: Record<string, string> = {};
    rows.forEach((row, i) => {
      map[row.place_id] = PALETTE[i % PALETTE.length];
    });
    return map;
  }, [rows]);

  const combined = useMemo(() => {
    const all = rows.flatMap((row) =>
      row.tee_times.map((tt, i) => ({
        key: `${row.place_id}-${tt.time}-${tt.booking_url ?? ""}-${i}`,
        place_id: row.place_id,
        clubName: clubs[row.place_id]?.name ?? row.place_id,
        time: tt.time,
        minutes: parseMinutes(tt.time) ?? Number.POSITIVE_INFINITY,
        price: tt.price,
        booking_url: tt.booking_url,
      })),
    );
    all.sort((a, b) => a.minutes - b.minutes);
    return all;
  }, [rows, clubs]);

  const visible = useMemo(
    () =>
      combined.filter(
        (r) =>
          enabled[r.place_id] !== false &&
          r.minutes >= range[0] &&
          r.minutes <= range[1],
      ),
    [combined, enabled, range],
  );

  const allOn = rows.every((r) => enabled[r.place_id] !== false);
  const setAll = (on: boolean) => {
    setEnabled((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.place_id] = on;
      return next;
    });
  };
  const toggle = (placeId: string) =>
    setEnabled((prev) => ({ ...prev, [placeId]: prev[placeId] === false }));

  return (
    <div className="space-y-4 p-4">
      {/* Filter bar */}
      <div className="space-y-4 rounded-md border border-gray-200 bg-gray-50 p-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Courses
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAll(true)}
                disabled={allOn}
                className="text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => setAll(false)}
                className="text-blue-600 hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {rows.map((row) => {
              const name = clubs[row.place_id]?.name ?? row.place_id;
              const on = enabled[row.place_id] !== false;
              return (
                <label
                  key={row.place_id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(row.place_id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colorFor[row.place_id] }}
                  />
                  <span className={on ? "" : "text-gray-400 line-through"}>
                    {name}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({row.tee_times.length})
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Time
            </span>
            <span className="font-mono text-sm text-gray-700">
              {formatMinutes(range[0])} – {formatMinutes(range[1])}
            </span>
          </div>
          <TimeRangeSlider value={range} onChange={setRange} />
        </div>
      </div>

      {/* Combined table */}
      <div className="text-xs text-gray-500">
        Showing {visible.length} of {combined.length} tee time
        {combined.length === 1 ? "" : "s"}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm italic text-gray-500">
          No tee times match your filters.
        </p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-md border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-left text-gray-600 shadow-[inset_0_-1px_0_0_#e5e7eb]">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-4 py-2 font-mono">
                    {r.time}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorFor[r.place_id] }}
                      />
                      {r.clubName}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.price ?? "—"}</td>
                  <td className="px-4 py-2">
                    {r.booking_url && (
                      <a
                        className="text-blue-600 hover:underline"
                        href={r.booking_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Book
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TimeRangeSlider({
  value,
  onChange,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [lo, hi] = value;
  const span = DAY_END - DAY_START;
  const loPct = ((lo - DAY_START) / span) * 100;
  const hiPct = ((hi - DAY_START) / span) * 100;

  return (
    <div className="relative h-6">
      {/* Background track */}
      <div className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded bg-gray-200" />
      {/* Selected range */}
      <div
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded bg-blue-500"
        style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
      />
      <input
        type="range"
        min={DAY_START}
        max={DAY_END}
        step={STEP}
        value={lo}
        onChange={(e) =>
          onChange([Math.min(Number(e.target.value), hi - STEP), hi])
        }
        aria-label="Earliest time"
        className="time-range-thumb absolute top-0 h-6 w-full"
      />
      <input
        type="range"
        min={DAY_START}
        max={DAY_END}
        step={STEP}
        value={hi}
        onChange={(e) =>
          onChange([lo, Math.max(Number(e.target.value), lo + STEP)])
        }
        aria-label="Latest time"
        className="time-range-thumb absolute top-0 h-6 w-full"
      />
    </div>
  );
}
