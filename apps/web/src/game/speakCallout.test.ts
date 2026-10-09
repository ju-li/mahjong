import { afterEach, describe, expect, it, vi } from 'vitest'

/** A synth that never finishes speaking, as Chrome's does once it wedges. */
function stuckSynth() {
  const spoken: string[] = []
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => [],
    addEventListener: () => {},
    speak: vi.fn((u: { text: string }) => {
      spoken.push(u.text)
      if (synth.speaking) synth.pending = true
      synth.speaking = true
    }),
    cancel: vi.fn(() => {
      synth.speaking = synth.pending = false
    }),
    resume: vi.fn(),
  }
  return { synth, spoken }
}

class Utterance {
  text: string
  constructor(text: string) {
    this.text = text
  }
}

type FakeSource = { buffer: { duration: number; url: string } | null; onended: (() => void) | null; connect: () => void; start: (at: number) => void }

/** An audio context whose clips are the text of their URL, each half a second long. */
function fakeContext() {
  const sources: FakeSource[] = []
  const starts: { url: string; at: number }[] = []
  const ctx = {
    state: 'running',
    currentTime: 10,
    destination: {},
    decodeAudioData: async (data: ArrayBuffer) => ({ duration: 0.5, url: new TextDecoder().decode(data) }),
    createBufferSource: () => {
      const source: FakeSource = { buffer: null, onended: null, connect: () => {}, start: (at) => starts.push({ url: source.buffer!.url, at }) }
      sources.push(source)
      return source
    },
  }
  return { ctx, sources, starts }
}

/** Use recordings at /clip/<seat>/<text>, fetched by `fetch`. */
async function withClips(ctx: unknown, fetch: (url: string) => Promise<Response>) {
  vi.doMock('./calloutClips', () => ({ clipUrl: (seat: number, text: string) => `/clip/${seat}/${text}` }))
  vi.doMock('./sound', () => ({ audio: () => ctx }))
  vi.stubGlobal('fetch', fetch)
  return import('./callout')
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('speakCallout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.doUnmock('./calloutClips')
    vi.doUnmock('./sound')
  })

  it("plays each seat's recording, back to back in call order, and waits for it to end", async () => {
    const { synth } = stuckSynth()
    vi.stubGlobal('speechSynthesis', synth)
    const { ctx, sources, starts } = fakeContext()
    // The first clip loads slower than the second; it must still play first.
    const slow = (url: string) => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(url)), url.includes('五万') ? 20 : 0))
    const { speakCallout, calloutsDone } = await withClips(ctx, slow)

    speakCallout({ seat: 0, text: '五万' })
    speakCallout({ seat: 1, text: '碰' })
    let done = false
    void calloutsDone().then(() => (done = true))
    await settled()
    expect(starts).toEqual([
      { url: '/clip/0/五万', at: 10 },
      { url: '/clip/1/碰', at: 10.5 },
    ])
    expect(synth.speak).not.toHaveBeenCalled()

    expect(done).toBe(false)
    sources.forEach((s) => s.onended?.())
    await settled()
    expect(done).toBe(true)
  })

  it('speaks a call whose recording fails to load', async () => {
    const { synth } = stuckSynth()
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    const { ctx, starts } = fakeContext()
    const { speakCallout } = await withClips(ctx, async () => new Response('', { status: 404 }))
    speakCallout({ seat: 2, text: '北风' })
    await settled()
    expect(starts).toEqual([])
    expect(synth.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: '北风' }))
  })

  it('stays silent rather than piling up calls while audio waits for a first tap', async () => {
    const { synth } = stuckSynth()
    vi.stubGlobal('speechSynthesis', synth)
    const { ctx, starts } = fakeContext()
    ctx.state = 'suspended'
    const { speakCallout } = await withClips(ctx, async (url) => new Response(url))
    speakCallout({ seat: 3, text: '胡' })
    await settled()
    expect(starts).toEqual([])
    expect(synth.speak).not.toHaveBeenCalled()
  })

  it('clears a stuck synth instead of queueing every later call behind it', async () => {
    vi.useFakeTimers()
    const { synth } = stuckSynth()
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    const { speakCallout } = await import('./callout')

    speakCallout({ seat: 0, text: '五万' })
    speakCallout({ seat: 1, text: '碰' })
    expect(synth.cancel).not.toHaveBeenCalled() // queued behind a call that may still be playing

    vi.advanceTimersByTime(10_000) // long past when both should have ended
    speakCallout({ seat: 2, text: '北风' })
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(synth.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: '北风' }))
  })

  it('resumes a paused synth', async () => {
    const { synth } = stuckSynth()
    synth.paused = true
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    const { speakCallout } = await import('./callout')
    speakCallout({ seat: 0, text: '胡' })
    expect(synth.resume).toHaveBeenCalled()
  })
})
