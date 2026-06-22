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
      includeAssets: ['khusela-icon.svg', 'khusela-icon.png'],
      manifest: {
        id: '/',
        name: 'Khusela Dashboard',
        short_name: 'Khusela',
        description: 'HR Management & Time Tracking',
        theme_color: '#0c1220',
        background_color: '#0c1220',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'khusela-icon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'khusela-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'khusela-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: 'khusela-icon.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Dashboard',
          },
          {
            src: 'khusela-icon.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Khusela Dashboard',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
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
          {
            urlPattern: /\/api\/time\/today/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'time-tracker-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
})