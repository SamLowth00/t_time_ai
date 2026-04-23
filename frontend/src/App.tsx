import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import BrsgolfPage from "./pages/BrsgolfPage";
import Clubv1Page from "./pages/Clubv1Page";
import ChronogolfPage from "./pages/ChronogolfPage";
import IntelligentgolfPage from "./pages/IntelligentgolfPage";
import WebcrawlerPage from "./pages/WebcrawlerPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/clubv1" replace />} />
        <Route path="/clubv1" element={<Clubv1Page />} />
        <Route path="/chronogolf" element={<ChronogolfPage />} />
        <Route path="/brsgolf" element={<BrsgolfPage />} />
        <Route path="/intelligentgolf" element={<IntelligentgolfPage />} />
        <Route path="/webcrawler" element={<WebcrawlerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
