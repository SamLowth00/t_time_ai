import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import BirleyWoodPage from "./pages/BirleyWoodPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/discover" replace />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/birley-wood" element={<Navigate to="/birley-wood/1" replace />} />
        <Route path="/birley-wood/:holeNumber" element={<BirleyWoodPage />} />
      </Routes>
    </BrowserRouter>
  );
}
