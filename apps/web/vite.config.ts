import { createHash } from 'node:crypto'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

/**
 * Emit `sw.js`: a small cache-first service worker that precaches every file of this build
 * (including the bot worker chunk) so the game plays offline after the first visit.
 * The cache name is a hash of the file list, so each deploy replaces the old cache.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles = ['index.html', 'manifest.webmanifest', 'favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']
      const files = [...new Set([...publicFiles, ...Object.keys(bundle)])].sort()
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const source = `// Generated at build time. Precaches the app shell for offline play.
const CACHE = 'mahjong-${version}'
const FILES = ${JSON.stringify(['/', ...files.map((f) => `/${f}`)])}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mahjong-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    // Network first for pages so a new deploy shows up; fall back to the cached shell offline.
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)))
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), offlineServiceWorker()],
})
