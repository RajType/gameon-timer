/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Set by `tauri dev` when targeting a physical/mobile device on the LAN.
const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/  ·  https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Keep Rust compiler errors visible in the terminal.
  clearScreen: false,

  // Expose TAURI_ENV_* variables to the frontend alongside VITE_*.
  envPrefix: ['VITE_', 'TAURI_ENV_'],

  server: {
    // Tauri expects a fixed port; fail instead of silently picking another.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  build: {
    // WebView2 (Windows) is evergreen Chromium; WKWebView/WebKitGTK elsewhere.
    // Tailwind v4 requires Chrome 111+ / Safari 16.4+.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome111' : 'safari16',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'oxc',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
