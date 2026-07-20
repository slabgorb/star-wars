import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Served under /star-wars/ on arcade.slabgorb.com, mirroring tempest's
  // /tempest/ base so root-relative asset URLs resolve in dev and build.
  base: '/',
  build: {
    // Multi-page: ship the game (index.html) AND the model contact sheet.
    rollupOptions: {
      input: {
        main: 'index.html',
        models: 'models.html',
        scenes: 'scenes.html',
      },
    },
  },
  // Pin a dedicated port next to tempest's 5273. strictPort fails loudly on a
  // collision instead of silently wandering to the next free port.
  // host is pinned to IPv4 loopback because strictPort alone does NOT protect
  // the pin: with 127.0.0.1:5274 held, vite happily binds [::1]:5274 and two
  // dev servers share the port with no error (td1-1 — the exact
  // silent-wrong-checkout trap the orchestrator CLAUDE.md warns about).
  server: {
    host: '127.0.0.1',
    port: 5274,
    strictPort: true,
    // The Cloudflare tunnel forwards Host: arcade.slabgorb.com; Vite blocks
    // unrecognised Hosts (DNS-rebinding protection) unless allow-listed.
    allowedHosts: ['arcade.slabgorb.com'],
  },
  preview: {
    host: '127.0.0.1',
    port: 5274,
    strictPort: true,
    allowedHosts: ['arcade.slabgorb.com'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
