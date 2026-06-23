import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      includeAssets: ['khusela-192.png', 'khusela-512.png'],
      manifest: {
        id: '/',
        name: 'Khusela Dashboard',
        short_name: 'Khusela',
        description: 'HR Management & Time Tracking',
        theme_color: '#0c1220',
        background_color: '#0c1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'khusela-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'khusela-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          // Google Fonts — cache aggressively
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-static-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Auth endpoints — NEVER cache, always go to network
          {
            urlPattern: /\/api\/auth\/.*/i,
            handler: 'NetworkOnly',
          },
          // CSRF + verify — never cache
          {
            urlPattern: /\/api\/csrf-token/i,
            handler: 'NetworkOnly',
          },
          // Time tracker today status — network first, fall back to cache for 5 min
          {
            urlPattern: /\/api\/time\/today/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'time-tracker-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // All other API calls — network first, no caching (never block mutations)
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 10 },
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})