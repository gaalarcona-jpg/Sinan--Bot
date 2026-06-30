import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getUser } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ObraDetalle from "./pages/ObraDetalle";
import EstadoResultados from "./pages/EstadoResultados";
import Rendiciones from "./pages/Rendiciones";

function RequireAuth({ children }) {
  const { token } = getUser();
  if (!token) return <Navigate to="/" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { token, rol } = getUser();
  if (!token) return <Navigate to="/" replace />;
  if (rol !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={<RequireAuth><Dashboard /></RequireAuth>}
        />
        <Route
          path="/obras/:id"
          element={<RequireAuth><ObraDetalle /></RequireAuth>}
        />
        <Route
          path="/resultados"
          element={<RequireAdmin><EstadoResultados /></RequireAdmin>}
        />
        <Route
          path="/rendiciones"
          element={<RequireAuth><Rendiciones /></RequireAuth>}
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
