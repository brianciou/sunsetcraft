import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths so the build works at any URL (Netlify root, GitHub Pages subpath, local file)
  base: './',
})
