import { defineConfig } from 'eslint/config';
import coreWebVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...coreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
]);
