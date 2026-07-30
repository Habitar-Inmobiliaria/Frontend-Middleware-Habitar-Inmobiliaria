import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En local la base es "/".
// En el deploy paralelo de Vercel, scripts/vercel-build.mjs ejecuta
// `vite build --base=/react/` para servir la SPA bajo /react/.
export default defineConfig({
  plugins: [react()],
});
