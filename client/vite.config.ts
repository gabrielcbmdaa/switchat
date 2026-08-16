import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      // Cualquier petición que empiece con /api se redirigirá automáticamente a tu Node.
      // VITE_API_TARGET permite apuntar a otro puerto sin tocar este archivo: hace falta
      // cuando dos worktrees levantan su propio servidor y no pueden compartir el 3000.
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  test: {
    // The components under test read the DOM (heights, focus, selection), so a real
    // document is not optional here.
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  }
})
