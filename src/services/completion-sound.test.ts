import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPLETION_SOUND_OPTIONS,
  DEFAULT_COMPLETION_SOUND_ID,
  getStoredCompletionSoundId,
  playCompletionSound,
  saveCompletionSoundId,
  type CompletionSoundId,
} from './completion-sound';

describe('completion-sound', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete (window as { AudioContext?: unknown }).AudioContext;
    delete (window as { webkitAudioContext?: unknown }).webkitAudioContext;
  });

  it('exposes improved results-complete sound options including mute', () => {
    const optionIds = COMPLETION_SOUND_OPTIONS.map((option) => option.id);

    expect(optionIds).toEqual([
      'glass-rise',
      'gentle-bell',
      'warm-marimba',
      'bright-pulse',
      'classic-chime',
      'off',
    ]);
  });

  it('falls back to default when localStorage has an invalid sound id', () => {
    localStorage.setItem('results_complete_sound', 'not-a-real-sound');

    expect(getStoredCompletionSoundId()).toBe(DEFAULT_COMPLETION_SOUND_ID);
  });

  it('persists and reloads the selected completion sound', () => {
    saveCompletionSoundId('warm-marimba');

    expect(getStoredCompletionSoundId()).toBe('warm-marimba');
  });

  it('does not create an audio context when sound is set to off', async () => {
    const AudioContextMock = vi.fn();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: AudioContextMock,
    });

    await playCompletionSound('off');

    expect(AudioContextMock).not.toHaveBeenCalled();
  });

  it('plays a selected preset using WebAudio oscillators', async () => {
    const oscillatorStart = vi.fn();
    const oscillatorStop = vi.fn();
    const frequencySet = vi.fn();
    const detuneSet = vi.fn();
    const oscillatorConnect = vi.fn();

    const gainSet = vi.fn();
    const gainLinearRamp = vi.fn();
    const gainExponentialRamp = vi.fn();
    const gainConnect = vi.fn();

    const createOscillator = vi.fn(() => ({
      type: 'sine' as OscillatorType,
      frequency: { setValueAtTime: frequencySet },
      detune: { setValueAtTime: detuneSet },
      connect: oscillatorConnect,
      start: oscillatorStart,
      stop: oscillatorStop,
    }));

    const createGain = vi.fn(() => ({
      gain: {
        setValueAtTime: gainSet,
        linearRampToValueAtTime: gainLinearRamp,
        exponentialRampToValueAtTime: gainExponentialRamp,
      },
      connect: gainConnect,
    }));

    const close = vi.fn(async () => undefined);

    class MockAudioContext {
      currentTime = 100;
      destination = {} as AudioNode;
      state: AudioContextState = 'running';

      createOscillator = createOscillator;
      createGain = createGain;
      resume = vi.fn(async () => undefined);
      close = close;
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });

    vi.useFakeTimers();

    await playCompletionSound('glass-rise');
    await vi.runAllTimersAsync();

    expect(createOscillator).toHaveBeenCalled();
    expect(oscillatorStart).toHaveBeenCalled();
    expect(oscillatorStop).toHaveBeenCalled();
    expect(frequencySet).toHaveBeenCalled();
    expect(gainLinearRamp).toHaveBeenCalled();
    expect(gainExponentialRamp).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('ignores invalid values passed into save', () => {
    saveCompletionSoundId('glass-rise');
    saveCompletionSoundId('bad-value' as CompletionSoundId);

    expect(getStoredCompletionSoundId()).toBe('glass-rise');
  });
});
