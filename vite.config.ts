import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base + HashRouter works under any GitHub Pages repo name.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
