/** URL de un archivo en `public/`, respetando la base de Vite (`/` o `/react/`). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const clean = String(path || '').replace(/^\//, '');
  return `${base.endsWith('/') ? base : `${base}/`}${clean}`;
}

export const HABITAR_LOGO_URL = publicUrl('habitar-logo.png');
export const HABITAR_ICON_URL = publicUrl('habitar-logo-icon.png');
