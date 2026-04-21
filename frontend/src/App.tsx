import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Clubv1Page from "./pages/Clubv1Page";
import ChronogolfPage from "./pages/ChronogolfPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/clubv1" replace />} />
        <Route path="/clubv1" element={<Clubv1Page />} />
        <Route path="/chronogolf" element={<ChronogolfPage />} />
      </Routes>
    </BrowserRouter>
  );
}
