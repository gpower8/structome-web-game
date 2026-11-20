import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production app is served by server.js (express + socket.io) from ./build.
// In dev, `npm run dev` serves the client on :3000 and proxies socket.io traffic
// to the game server (`npm start`, default :8080), matching the same-origin
// `io('/')` connection the client uses in production.
const backend = process.env.VITE_DEV_BACKEND ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/socket.io': {
        target: backend,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
