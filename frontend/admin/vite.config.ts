import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_PUBLIC_',
  build: { sourcemap: false, target: 'es2022' },
  server: { port: 5174 },
});
