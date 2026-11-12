import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Only VITE_PUBLIC_* variables may reach the browser bundle.
  envPrefix: 'VITE_PUBLIC_',
  build: { sourcemap: false, target: 'es2022' },
  server: { port: 5173 },
});
