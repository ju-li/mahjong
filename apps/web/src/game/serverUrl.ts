/** Game server address: set at build time for deploys; the local dev server otherwise. */
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`

/** The same server over HTTP(S), for plain requests such as feedback. */
export const SERVER_HTTP_URL = SERVER_URL.replace(/^ws/, 'http').replace(/\/$/, '')
