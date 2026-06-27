import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Served under /star-wars/ on arcade.slabgorb.com, mirroring tempest's
  // /tempest/ base so root-relative asset URLs resolve in dev and build.
  base: '/star-wars/',
  // Pin a dedicated port next to tempest's 5273. strictPort fails loudly on a
  // collision instead of silently wandering to the next free port.
  server: {
    port: 5274,
    strictPort: true,
    // The Cloudflare tunnel forwards Host: arcade.slabgorb.com; Vite blocks
    // unrecognised Hosts (DNS-rebinding protection) unless allow-listed.
    allowedHosts: ['arcade.slabgorb.com'],
  },
  preview: {
    port: 5274,
    strictPort: true,
    allowedHosts: ['arcade.slabgorb.com'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
