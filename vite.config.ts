import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // The auth broker allowlists exactly http://localhost:5173. Fail loudly instead of drifting to
  // 5174 when the port is busy, which would surface as 403 origin_not_allowed.
  server: { port: 5173, strictPort: true },
})
