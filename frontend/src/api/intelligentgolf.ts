import type { TeeTime } from "./clubv1";

export type { TeeTime } from "./clubv1";

type Response = { tee_times: TeeTime[] };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function fetchTeeTimes(
  url: string,
  date: string,
  players: number,
): Promise<TeeTime[]> {
  const res = await fetch(`${API_URL}/intelligentgolf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, date, players }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }

  const data: Response = await res.json();
  return data.tee_times;
}

