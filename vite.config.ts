import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://script.google.com/macros/s/AKfycbytHLZ3bvYtaeX-RKgQvmx1PZHFse0z08XsggKByD651SrHKRc0uiUGMulyJOuxgs5e/exec',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        followRedirects: true,
      },
    },
  },
});
