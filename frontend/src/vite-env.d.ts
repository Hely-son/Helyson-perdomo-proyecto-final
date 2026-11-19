/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base del API (ver .env.example en la raíz). Opcional; el valor por defecto está en src/api/client.ts. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
