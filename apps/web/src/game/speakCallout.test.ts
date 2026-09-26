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

describe('speakCallout', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
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
