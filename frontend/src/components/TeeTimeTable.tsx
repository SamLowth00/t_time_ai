import type { TeeTime } from "../api/clubv1";

export default function TeeTimeTable({ teeTimes }: { teeTimes: TeeTime[] }) {
  if (teeTimes.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No tee times found for that date.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">1p</th>
            <th className="px-4 py-2 font-medium">2p</th>
            <th className="px-4 py-2 font-medium">3p</th>
            <th className="px-4 py-2 font-medium">4p</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {teeTimes.map((tt, i) => (
            <tr key={`${tt.time}-${i}`} className="border-t border-gray-100">
              <td className="px-4 py-2 font-mono">{tt.time}</td>
              <td className="px-4 py-2">{tt.prices["1"] ?? "—"}</td>
              <td className="px-4 py-2">{tt.prices["2"] ?? "—"}</td>
              <td className="px-4 py-2">{tt.prices["3"] ?? "—"}</td>
              <td className="px-4 py-2">{tt.prices["4"] ?? "—"}</td>
              <td className="px-4 py-2">
                {tt.booking_url && (
                  <a
                    className="text-blue-600 hover:underline"
                    href={tt.booking_url}
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
  );
}
