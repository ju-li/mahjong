# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Voice callouts

Callouts (碰, 胡, 五万…) play recorded clips from `src/assets/callouts/seat{0-3}/`, one ElevenLabs voice per seat, recorded with the Eleven v4 model. They are bundled as hashed `/assets` files, so each player downloads them once and the service worker keeps them for offline play. If a clip is missing or fails to load, the browser's speech synthesis says the call instead.

To record or redo the clips you need Node 22.18+, `ffmpeg` and an ElevenLabs API key. First set the four voice ids in `SEAT_VOICES` in `scripts/gen-callouts.ts`, then run:

```sh
ELEVENLABS_API_KEY=… pnpm --filter web gen:callouts                      # records missing clips
ELEVENLABS_API_KEY=… pnpm --filter web gen:callouts --only pung,5bing    # redoes some clips
ELEVENLABS_API_KEY=… pnpm --filter web gen:callouts --force              # redoes every clip
```

Listen to every clip on `scripts/callouts-review.html`, then commit the mp3s. A test fails if any seat is missing a clip for any phrase, so when you add a phrase to `src/game/calloutVocab.ts`, record it for all four voices.
