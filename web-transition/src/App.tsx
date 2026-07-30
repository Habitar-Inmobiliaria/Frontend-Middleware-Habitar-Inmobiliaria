import { Routes, Route } from 'react-router-dom';
import VitrinaPage from './pages/VitrinaPage';

// Rutas de la aplicación.
// - /vitrina/:token        — misma ruta que prod (útil en local y cutover final)
// - /vitrina-react/:token  — ruta paralela en Vercel mientras vanilla sigue en /vitrina/:token
export default function App() {
  return (
    <Routes>
      <Route path="/vitrina/:token" element={<VitrinaPage />} />
      <Route path="/vitrina-react/:token" element={<VitrinaPage />} />
      <Route path="*" element={<RouteNotFound />} />
    </Routes>
  );
}

function RouteNotFound() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Vitrina Inmobiliaria</h1>
      <p>Accede con un enlace válido: /vitrina/&#123;token&#125;</p>
      <p style={{ color: '#666', fontSize: 14 }}>
        Durante el cutover paralelo también está disponible /vitrina-react/&#123;token&#125;
      </p>
    </main>
  );
}
