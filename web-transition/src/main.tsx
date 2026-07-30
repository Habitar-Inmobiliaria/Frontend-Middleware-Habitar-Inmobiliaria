import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { HABITAR_LOGO_URL } from './utils/brand';
import './styles/theme.css';

// Marca de agua: URL pública con base correcta (/ o /react/).
document.documentElement.style.setProperty(
  '--habitar-watermark-url',
  `url("${HABITAR_LOGO_URL}")`,
);

// Punto de entrada: monta React sobre el nodo #root.
// BrowserRouter se coloca en la raíz para que el enrutado por URL
// (/vitrina/:token) esté disponible en toda la aplicación.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
