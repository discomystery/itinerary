import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset paths so the build works at any subpath (e.g. GitHub Pages /itinerary/).
  base: './',
  plugins: [react(), tailwindcss()],
  test: { environment: 'node' },
} as never)
