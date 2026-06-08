import type {
  GolfHole,
  LatLng,
  OverpassElement,
  OverpassNode,
  OverpassResponse,
  OverpassWay,
} from "../types/golf";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Bounding box covering Birley Wood Golf Course, Sheffield
const QUERY = `
[out:json][timeout:25];
(
  way["golf"="hole"](53.31,-1.43,53.35,-1.38);
  relation["golf"="hole"](53.31,-1.43,53.35,-1.38);
  node["golf"="tee"](53.31,-1.43,53.35,-1.38);
);
out body;
>;
out skel qt;
`.trim();

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function bearingBetween(from: LatLng, to: LatLng): number {
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function centroid(nodes: LatLng[]): LatLng {
  const lat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length;
  const lng = nodes.reduce((s, n) => s + n.lng, 0) / nodes.length;
  return { lat, lng };
}

function distance(a: LatLng, b: LatLng): number {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function holeNumberFromTags(tags?: Record<string, string>): number | null {
  const raw = tags?.ref ?? tags?.hole;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

export async function fetchBirleyWoodHoles(): Promise<GolfHole[]> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status}`);
  }

  const data: OverpassResponse = await res.json();
  const elements: OverpassElement[] = data.elements;

  // Partition elements
  const nodeMap = new Map<number, OverpassNode>();
  const teeNodes: OverpassNode[] = [];
  const holeWays: OverpassWay[] = [];

  for (const el of elements) {
    if (el.type === "node") {
      nodeMap.set(el.id, el);
      if (el.tags?.golf === "tee") {
        teeNodes.push(el);
      }
    } else if (el.type === "way" && el.tags?.golf === "hole") {
      holeWays.push(el);
    }
  }

  // Resolve way node refs → LatLng arrays
  const resolvedWays = holeWays.map((way) => {
    const nodes: LatLng[] = way.nodes
      .map((id) => nodeMap.get(id))
      .filter((n): n is OverpassNode => n !== undefined)
      .map((n) => ({ lat: n.lat, lng: n.lon }));
    return { way, nodes };
  });

  // Build tee map by hole number when tagged
  const teeByHoleNumber = new Map<number, LatLng>();
  const untaggedTees: LatLng[] = [];
  for (const tee of teeNodes) {
    const n = holeNumberFromTags(tee.tags);
    if (n !== null) {
      teeByHoleNumber.set(n, { lat: tee.lat, lng: tee.lon });
    } else {
      untaggedTees.push({ lat: tee.lat, lng: tee.lon });
    }
  }

  // Assemble GolfHole records
  const holes: GolfHole[] = resolvedWays
    .filter((r) => r.nodes.length >= 2)
    .map((r, idx) => {
      const wayHoleNum = holeNumberFromTags(r.way.tags);
      const holeNumber = wayHoleNum ?? idx + 1;

      // Find tee: prefer tagged match, else closest untagged tee to way start
      let tee: LatLng;
      if (teeByHoleNumber.has(holeNumber)) {
        tee = teeByHoleNumber.get(holeNumber)!;
      } else if (untaggedTees.length > 0) {
        const wayStart = r.nodes[0];
        let closest = untaggedTees[0];
        let minDist = distance(wayStart, closest);
        for (const t of untaggedTees.slice(1)) {
          const d = distance(wayStart, t);
          if (d < minDist) {
            minDist = d;
            closest = t;
          }
        }
        tee = closest;
      } else {
        // No tee node at all — use first way node as fallback
        tee = r.nodes[0];
      }

      const greenEnd = r.nodes[r.nodes.length - 1];
      const greenCenter = centroid(r.nodes);
      const bearingToGreen = bearingBetween(tee, greenEnd);

      return {
        holeNumber,
        tee,
        greenEnd,
        greenCenter,
        bearingToGreen,
        wayNodes: r.nodes,
      };
    });

  holes.sort((a, b) => a.holeNumber - b.holeNumber);

  if (holes.length === 0) {
    throw new Error(
      "No hole data found for Birley Wood. The course may not be mapped in OpenStreetMap yet."
    );
  }

  return holes;
}
