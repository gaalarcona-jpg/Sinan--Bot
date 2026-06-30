import { useNavigate, useLocation } from "react-router-dom";
import { clearToken, getUser } from "../api";
import { useEffect, useState } from "react";
import { api } from "../api";

export default function Layout({ children, title, backTo }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { nombre, rol } = getUser();
  const [version, setVersion] = useState("");

  useEffect(() => {
    api.version().then(v => setVersion(v.git_tag || v.version)).catch(() => {});
  }, []);

  function logout() {
    clearToken();
    navigate("/");
  }

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen flex flex-col bg-sinan-bg">
      {/* Header */}
      <header className="bg-sinan-surface border-b border-sinan-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        {backTo ? (
          <button
            onClick={() => navigate(backTo)}
            className="text-gold-400 text-2xl w-10 h-10 flex items-center justify-center"
          >
            ←
          </button>
        ) : (
          <span className="text-gold-500 font-bold text-xl tracking-tight">SINAN</span>
        )}
        <h1 className="flex-1 text-sinan-text font-semibold text-base truncate">{title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sinan-muted text-sm hidden sm:block">{nombre}</span>
          <button
            onClick={logout}
            className="text-sinan-muted text-sm border border-sinan-border rounded-lg px-3 py-1.5 hover:border-gold-500 transition-colors"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-4 max-w-2xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="bg-sinan-surface border-t border-sinan-border px-2 py-2 flex justify-around sticky bottom-0">
        <NavBtn
          label="Obras"
          icon="🏗️"
          active={isActive("/dashboard")}
          onClick={() => navigate("/dashboard")}
        />
        <NavBtn
          label="Pendientes"
          icon="⏳"
          active={isActive("/rendiciones")}
          onClick={() => navigate("/rendiciones")}
        />
        {rol === "admin" && (
          <NavBtn
            label="Resultados"
            icon="📊"
            active={isActive("/resultados")}
            onClick={() => navigate("/resultados")}
          />
        )}
      </nav>

      {/* Footer version */}
      <div className="text-center text-sinan-muted text-xs py-1 bg-sinan-bg">
        {version && <span>v {version}</span>}
      </div>
    </div>
  );
}

function NavBtn({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl transition-colors ${
        active ? "text-gold-500 bg-gold-500/10" : "text-sinan-muted"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
