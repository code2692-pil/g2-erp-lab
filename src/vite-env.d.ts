/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DATA_MODE?: "mock" | "api";
  readonly VITE_E2E_TEST_MODE?: "true";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
