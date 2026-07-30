import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/theme.css';

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
