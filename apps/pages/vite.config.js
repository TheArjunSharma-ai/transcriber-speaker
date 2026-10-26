import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/transcriber-speaker/',
  plugins: [react(), tailwindcss()],
  define: { 'process.env.NEXT_PUBLIC_BROWSER_EDITION': JSON.stringify('true') },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: 'next/link', replacement: fileURLToPath(new URL('./src/navigation.jsx', import.meta.url)) },
      { find: 'next/navigation', replacement: fileURLToPath(new URL('./src/navigation.jsx', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('../web/src', import.meta.url)) },
    ],
  },
  server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  preview: { host: '127.0.0.1' },
})
