/// <reference types="vite/client" />

// Variables de entorno propias del proyecto (prefijo VITE_).
interface ImportMetaEnv {
  readonly VITE_BACKEND_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
