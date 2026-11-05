import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` serves the UI only. Use `npm run preview:local` (or `netlify dev`)
// to run the UI together with the API functions.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8888' },
  },
  build: { sourcemap: false, target: 'es2022' },
});
