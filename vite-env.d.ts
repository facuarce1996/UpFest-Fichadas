// reference types="vite/client" removed

interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
  // más variables de entorno...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}