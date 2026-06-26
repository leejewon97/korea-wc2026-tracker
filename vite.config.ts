import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/client',
  publicDir: 'public',
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html'),
        go: resolve(__dirname, 'src/client/go.html'),
        admin: resolve(__dirname, 'src/client/admin.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
});
