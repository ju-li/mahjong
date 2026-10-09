/**
 * Records every callout with ElevenLabs, one voice per seat, into src/assets/callouts/seat{0-3}/{id}.mp3.
 * The clips are committed and served with the app, so players never call ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=… pnpm --filter web gen:callouts [--force] [--only pung,5bing] [--seats 0,2]
 *
 * - Needs Node 22.18+ (runs this TypeScript directly) and ffmpeg (trims silence, evens out loudness).
 * - Existing clips are kept unless --force or --only names them, so a re-run only fills gaps.
 * - Listen to every clip on scripts/callouts-review.html before committing; redo bad ones with --only.
 * - Using the clips in a commercial product needs a paid ElevenLabs plan.
 */
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { CALLOUT_PHRASES, MELD_CALLS, WIN_CALLS, type CalloutPhrase } from '../src/game/calloutVocab.ts'

/**
 * One ElevenLabs voice id per seat, so players can be told apart by ear: pick native Mandarin
 * speakers from the Voice Library (say two women, two men). ELEVENLABS_VOICES=id0,id1,id2,id3 overrides.
 */
const SEAT_VOICES: readonly string[] = ['hZTuv9Zqrq4yHYrEmF1r', 'DowyQ68vDpgFYdWVGjc3', 'bhJUNIXWQQ94l8eI2VUf', 'BqljjWyTnrioXPCNkCd4']
/** eleven_turbo_v2_5 / eleven_flash_v2_5 also take a language code; multilingual v2 sounds best. */
const MODEL = 'eleven_multilingual_v2'
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
/** Same seed, same audio: re-running for one clip doesn't change the rest of a voice's character. */
const SEED = 1688
/**
 * Read before each phrase but not recorded. It sets the scene so the phrase is said as Mandarin
 * at the table: 九条, 白板 and 一万 are Japanese words too.
 */
const PREVIOUS_TEXT = '打麻将的时候，大声喊：'
/** Claims are barked; a bare one-character text is also often mumbled or dropped. */
const SHOUTED = new Set<string>([...Object.values(MELD_CALLS), ...Object.values(WIN_CALLS)])
/** Loudness every clip is brought to (mean, dBFS), without letting its peak pass PEAK_DB. */
const TARGET_MEAN_DB = -18
const PEAK_DB = -1
/** Requests at once; ElevenLabs plans allow 2–15. */
const CONCURRENCY = 3

const WEB = join(import.meta.dirname, '..')
const OUT = join(WEB, 'src/assets/callouts')
const REVIEW = join(WEB, 'scripts/callouts-review.html')
const run = promisify(execFile)

function parseArgs(argv: string[]) {
  const opts = { force: false, only: null as Set<string> | null, seats: [0, 1, 2, 3] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--force') opts.force = true
    else if (arg === '--only') opts.only = new Set(argv[++i]?.split(',') ?? [])
    else if (arg === '--seats') opts.seats = (argv[++i] ?? '').split(',').map(Number)
    else throw new Error(`Unknown argument ${arg}`)
  }
  const ids = new Set(CALLOUT_PHRASES.map((p) => p.id))
  const unknown = [...(opts.only ?? [])].filter((id) => !ids.has(id))
  if (unknown.length) throw new Error(`Unknown phrase ids: ${unknown.join(', ')}. Known: ${[...ids].join(' ')}`)
  if (!opts.seats.every((s) => [0, 1, 2, 3].includes(s))) throw new Error('--seats takes seat numbers 0–3')
  return opts
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

async function synthesize(apiKey: string, voice: string, phrase: CalloutPhrase): Promise<Buffer> {
  const body = {
    text: SHOUTED.has(phrase.text) ? `${phrase.text}！` : phrase.text,
    model_id: MODEL,
    voice_settings: VOICE_SETTINGS,
    seed: SEED,
    previous_text: PREVIOUS_TEXT,
    ...(MODEL.endsWith('_v2_5') ? { language_code: 'zh' } : {}),
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
      continue
    }
    throw new Error(`ElevenLabs ${res.status} for ${phrase.id}: ${await res.text()}`)
  }
}

/** Trim the silence ElevenLabs leaves around speech (calls must land at once), even out loudness, encode small. */
async function finish(raw: Buffer, out: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'callout-'))
  try {
    const input = join(dir, 'raw.mp3')
    const trimmed = join(dir, 'trimmed.wav')
    await writeFile(input, raw)
    const trim = 'silenceremove=start_periods=1:start_threshold=-50dB'
    await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', `${trim},areverse,${trim},areverse,apad=pad_dur=0.04`, '-ac', '1', trimmed])
    const { stderr } = await run('ffmpeg', ['-nostats', '-i', trimmed, '-af', 'volumedetect', '-f', 'null', '-'])
    const level = (name: string) => Number(new RegExp(`${name}: (-?[\\d.]+) dB`).exec(stderr)?.[1])
    const mean = level('mean_volume')
    const peak = level('max_volume')
    if (!Number.isFinite(mean) || !Number.isFinite(peak)) throw new Error(`Silent clip: ${out}`)
    const gain = Math.min(TARGET_MEAN_DB - mean, PEAK_DB - peak)
    await run('ffmpeg', ['-v', 'error', '-y', '-i', trimmed, '-af', `volume=${gain.toFixed(2)}dB`, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', out])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** A page to listen to every clip side by side before committing them. */
async function writeReview(): Promise<void> {
  const cell = (seat: number, id: string) => `<td><audio controls preload="none" src="../src/assets/callouts/seat${seat}/${id}.mp3"></audio></td>`
  const rows = CALLOUT_PHRASES.map((p) => `<tr><th>${p.text}</th><td><code>${p.id}</code></td>${[0, 1, 2, 3].map((s) => cell(s, p.id)).join('')}</tr>`)
  const html = `<!doctype html><meta charset="utf-8"><title>Callout clips</title>
<style>body{font:14px system-ui;margin:16px}th{font-size:20px;text-align:left;padding-right:12px}td{padding:2px 6px}audio{height:32px}</style>
<table><tr><th></th><th>id</th><th>Seat 0</th><th>Seat 1</th><th>Seat 2</th><th>Seat 3</th></tr>
${rows.join('\n')}
</table>\n`
  await writeFile(REVIEW, html)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('Set ELEVENLABS_API_KEY')
  const voices = process.env.ELEVENLABS_VOICES?.split(',') ?? SEAT_VOICES
  const missing = opts.seats.filter((s) => !voices[s])
  if (missing.length) throw new Error(`No voice id for seat ${missing.join(', ')}: set SEAT_VOICES in this script or ELEVENLABS_VOICES`)
  await run('ffmpeg', ['-version']).catch(() => {
    throw new Error('ffmpeg is not installed')
  })

  const jobs: { seat: number; phrase: CalloutPhrase; out: string }[] = []
  for (const seat of opts.seats) {
    await mkdir(join(OUT, `seat${seat}`), { recursive: true })
    for (const phrase of CALLOUT_PHRASES) {
      if (opts.only && !opts.only.has(phrase.id)) continue
      const out = join(OUT, `seat${seat}`, `${phrase.id}.mp3`)
      if (!opts.force && !opts.only && (await exists(out))) continue
      jobs.push({ seat, phrase, out })
    }
  }

  let done = 0
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      await finish(await synthesize(apiKey, voices[job.seat]!, job.phrase), job.out)
      console.log(`[${++done}] seat${job.seat} ${job.phrase.id} ${job.phrase.text}`)
    }
  }
  const total = jobs.length
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await writeReview()
  console.log(`Recorded ${total} clip(s). Listen to them on ${REVIEW}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
