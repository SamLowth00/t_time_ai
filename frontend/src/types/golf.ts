export interface LatLng {
  lat: number;
  lng: number;
}

export interface GolfHole {
  holeNumber: number;
  tee: LatLng;
  /** Last node of the OSM hole way — best approximation of the actual green/pin position. */
  greenEnd: LatLng;
  /** Centroid of all way nodes — midpoint of the hole, used for camera framing. */
  greenCenter: LatLng;
  bearingToGreen: number; // degrees 0–360 from tee toward green
  wayNodes: LatLng[];
}

export interface HoleDataState {
  status: "idle" | "loading" | "success" | "error";
  holes: GolfHole[];
  error: string | null;
}

// Raw Overpass API response shapes
export interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export interface OverpassRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
}

export type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

export interface OverpassResponse {
  elements: OverpassElement[];
}
