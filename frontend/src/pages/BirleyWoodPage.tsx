import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CourseViewer, { type CourseViewerHandle } from "../components/course-viewer";
import { fetchBirleyWoodHoles } from "../api/birleyWoodHoles";
import type { HoleDataState } from "../types/golf";

type Action =
  | { type: "loading" }
  | { type: "success"; holes: HoleDataState["holes"] }
  | { type: "error"; error: string };

function reducer(_state: HoleDataState, action: Action): HoleDataState {
  switch (action.type) {
    case "loading":
      return { status: "loading", holes: [], error: null };
    case "success":
      return { status: "success", holes: action.holes, error: null };
    case "error":
      return { status: "error", holes: [], error: action.error };
  }
}

const INITIAL_STATE: HoleDataState = { status: "idle", holes: [], error: null };

export default function BirleyWoodPage() {
  const { holeNumber } = useParams<{ holeNumber: string }>();
  const navigate = useNavigate();
  const [holeData, dispatch] = useReducer(reducer, INITIAL_STATE);
  const viewerRef = useRef<CourseViewerHandle>(null);
  const [flying, setFlying] = useState(false);
  const flyResetRef = useRef<ReturnType<typeof setTimeout>>();
  const [liveCamera, setLiveCamera] = useState<{ tilt: number; heading: number; range: number; center: { lat: number; lng: number } } | null>(null);

  const currentNumber = Math.max(1, parseInt(holeNumber ?? "1", 10) || 1);

  useEffect(() => {
    dispatch({ type: "loading" });
    fetchBirleyWoodHoles()
      .then((holes) => dispatch({ type: "success", holes }))
      .catch((err: unknown) =>
        dispatch({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        })
      );
  }, []);

  // Reset flying state when hole changes
  useEffect(() => {
    setFlying(false);
    clearTimeout(flyResetRef.current);
  }, [currentNumber]);

  const holes = holeData.status === "success" ? holeData.holes : [];
  const hole = holes.find((h) => h.holeNumber === currentNumber) ?? holes[0] ?? null;
  const currentIndex = hole ? holes.indexOf(hole) : 0;
  const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

  function goTo(index: number) {
    const h = holes[index];
    if (h) navigate(`/birley-wood/${h.holeNumber}`);
  }

  function handleFlyThrough() {
    if (flying) return;
    clearTimeout(flyResetRef.current);
    viewerRef.current?.flyThrough();
    setFlying(true);
    // Generous upper bound: 50ms/m × longest UK par-5 (~550m) + pullback + buffer
    flyResetRef.current = setTimeout(() => setFlying(false), 550 * 50 + 5000);
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">

      {/* Full-screen 3D viewer — keyed on holeNumber so gmp-map-3d remounts
          fresh for each hole, avoiding accumulated internal camera state */}
      {holeData.status === "success" && hole && (
        <CourseViewer
          ref={viewerRef}
          googleApiKey={googleApiKey}
          hole={hole}
          onCameraChange={setLiveCamera}
        />
      )}

      {(holeData.status === "idle" || holeData.status === "loading") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <p className="text-sm text-white/70">Loading hole data…</p>
        </div>
      )}

      {holeData.status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-medium text-red-400">Failed to load course data</p>
          <p className="text-xs text-white/50">{holeData.error}</p>
        </div>
      )}

      {holeData.status === "success" && (
        <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/60 px-5 py-2 backdrop-blur-sm">
          <p className="text-sm font-semibold text-white">Birley Wood Golf Course</p>
        </div>
      )}

      {holeData.status === "success" && hole && (
        <div className="absolute left-4 top-16 rounded bg-black/70 p-3 font-mono text-xs text-white backdrop-blur-sm">
          <p className="mb-1 font-bold">Debug</p>
          <p>tee &nbsp;&nbsp;&nbsp;&nbsp;{hole.tee.lat.toFixed(5)}, {hole.tee.lng.toFixed(5)}</p>
          <p>center &nbsp;{liveCamera ? `${liveCamera.center.lat.toFixed(5)}, ${liveCamera.center.lng.toFixed(5)}` : "—"}</p>
          <p>tilt &nbsp;&nbsp;&nbsp;{liveCamera ? `${liveCamera.tilt.toFixed(1)}°` : "—"}</p>
          <p>heading {liveCamera ? `${liveCamera.heading.toFixed(1)}°` : "—"}</p>
          <p>range &nbsp;&nbsp;{liveCamera ? `${liveCamera.range.toFixed(0)}m` : "—"}</p>
        </div>
      )}

      {holeData.status === "success" && hole && (
        <>
          {/* Fly-through button */}
          <button
            onClick={handleFlyThrough}
            disabled={flying}
            className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-full bg-black/60 px-5 py-3 text-sm font-medium text-white backdrop-blur-sm transition-opacity disabled:opacity-40"
          >
            <span className="text-base leading-none">{flying ? "⏳" : "▶"}</span>
            {flying ? "Flying…" : "Fly through"}
          </button>

          {/* Hole navigation */}
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-5 rounded-full bg-black/60 px-6 py-3 backdrop-blur-sm">
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="text-sm text-white transition-opacity disabled:opacity-30"
            >
              ← Prev
            </button>
            <div className="text-center">
              <p className="text-base font-bold text-white">Hole {hole.holeNumber}</p>
              <p className="text-xs text-white/50">{holes.length} holes mapped</p>
            </div>
            <button
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === holes.length - 1}
              className="text-sm text-white transition-opacity disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
