import { Routes, Route } from 'react-router-dom';
import VitrinaPage from './pages/VitrinaPage';

// Rutas de la aplicación (todas → React).
// Oficial: /vitrina/:token
// Alias: /vitrina-react/:token y /vitrina-legacy/:token (compat)
export default function App() {
  return (
    <Routes>
      <Route path="/vitrina/:token" element={<VitrinaPage />} />
      <Route path="/vitrina-react/:token" element={<VitrinaPage />} />
      <Route path="/vitrina-legacy/:token" element={<VitrinaPage />} />
      <Route path="*" element={<RouteNotFound />} />
    </Routes>
  );
}

function RouteNotFound() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Vitrina Inmobiliaria</h1>
      <p>Accede con un enlace válido: /vitrina/&#123;token&#125;</p>
    </main>
  );
}
