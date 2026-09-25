/**
 * Force the newest deploy to load. An installed PWA can keep running an old build for a long
 * time (it is rarely fully closed), so this drops the offline cache and service worker, then
 * reloads from the network. The match and settings live in localStorage and survive the reload;
 * `main.ts` registers the service worker again, which re-caches the new build for offline play.
 *
 * Returns false (and changes nothing) when the server can't be reached, so an offline player
 * keeps their working offline copy.
 */
export async function loadLatestVersion(): Promise<boolean> {
  try {
    const res = await fetch('/', { cache: 'no-store' })
    if (!res.ok) return false
  } catch {
    return false
  }
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('mahjong-')).map((k) => caches.delete(k)))
    }
  } catch {
    // Best effort: the reload below still fetches the page from the network.
  }
  window.location.reload()
  return true
}
