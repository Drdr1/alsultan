import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: './', build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? true : undefined), outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1200 } });
