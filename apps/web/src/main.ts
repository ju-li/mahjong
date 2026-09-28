// First import, so console capture starts before any other module runs (for feedback reports).
import './game/consoleLog'
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { startPageviews } from './game/analytics'

createApp(App).mount('#app')
startPageviews()

// Offline play: register the build-generated service worker (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is optional; the game works online without it.
    })
  })
}
