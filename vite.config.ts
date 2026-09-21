import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'mascot-celebrate.png', 'mascot-celebrate.webp'],
      manifest: {
        name: 'RataFit',
        short_name: 'RataFit',
        description: 'Registro de entrenamiento fullbody con foco en pecho y espalda',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        runtimeCaching: [
          {
            // Imágenes de ejercicios servidas desde GitHub: se guardan en caché
            // la primera vez para poder consultarlas luego sin conexión.
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*\.(?:jpg|jpeg|png|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
