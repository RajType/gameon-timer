/*
 * Warning sounds, synthesised with WebAudio — no audio files, works offline.
 * Browsers/WebViews start AudioContext suspended until a user gesture, so
 * `unlockAudio()` is called on the first pointer/key event (see App).
 */

import type { SoundPreset } from '@/types'

export const SOUND_PRESET_LABEL: Record<SoundPreset, string> = {
  chime: 'زنگ ملایم',
  bell: 'ناقوس',
  beep: 'بوق کوتاه',
}

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (context) return context
  try {
    context = new AudioContext()
  } catch {
    context = null
  }
  return context
}

export function unlockAudio(): void {
  const ctx = audio()
  if (ctx?.state === 'suspended') void ctx.resume()
}

function tone(
  ctx: AudioContext,
  frequency: number,
  type: OscillatorType,
  start: number,
  duration: number,
  peak: number,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Play a preset at `volume` (0–100). Silently does nothing without audio. */
export function playSound(preset: SoundPreset, volume: number): void {
  const ctx = audio()
  if (!ctx || volume <= 0) return
  if (ctx.state === 'suspended') void ctx.resume()
  const peak = (Math.min(100, volume) / 100) * 0.35
  const t = ctx.currentTime + 0.02
  switch (preset) {
    case 'chime':
      tone(ctx, 880, 'sine', t, 0.7, peak)
      tone(ctx, 1318.5, 'sine', t + 0.18, 0.9, peak * 0.8)
      break
    case 'bell':
      tone(ctx, 659.3, 'triangle', t, 1.6, peak)
      tone(ctx, 1648, 'sine', t, 1.1, peak * 0.35)
      break
    case 'beep':
      for (let i = 0; i < 3; i++) tone(ctx, 1000, 'square', t + i * 0.2, 0.12, peak * 0.5)
      break
  }
}
