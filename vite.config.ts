import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// HTTPS=0 → serveur HTTP local (la caméra reste autorisée sur localhost).
// Par défaut HTTPS auto-signé : nécessaire pour ouvrir la caméra depuis un téléphone sur le réseau local.
const https = process.env.HTTPS !== '0';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: https ? [basicSsl()] : [],
  server: { host: true, port: https ? 5173 : 5174 },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        generateur: resolve(__dirname, 'web/index.html'),
        scanner: resolve(__dirname, 'web/scan.html'),
        feuille: resolve(__dirname, 'web/feuille-test.html'),
      },
    },
  },
});
