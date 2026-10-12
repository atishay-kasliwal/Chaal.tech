import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: '../dist/frontend', // Output to a dist folder at the monorepo root? Or keep within package?
    // We'll keep within package for now, but we can adjust later.
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
});