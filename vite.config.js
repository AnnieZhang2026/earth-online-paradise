import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/earth-online-paradise/',
  define: {},
  resolve: {
    alias: {
      cesium: 'cesium'
    }
  }
});
