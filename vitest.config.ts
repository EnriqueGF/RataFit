import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // El backend tiene su propia suite (server/) con entorno node; aquí solo
    // corren los tests de la PWA, que necesitan jsdom.
    exclude: ['**/node_modules/**', 'server/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/vite-env.d.ts'],
    },
  },
});
