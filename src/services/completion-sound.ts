export type CompletionSoundId =
  | 'glass-rise'
  | 'gentle-bell'
  | 'warm-marimba'
  | 'bright-pulse'
  | 'classic-chime'
  | 'off';

export type CompletionSoundOption = {
  id: CompletionSoundId;
  label: string;
  description: string;
};

type PlayableCompletionSoundId = Exclude<CompletionSoundId, 'off'>;

type SoundEvent = {
  type: OscillatorType;
  frequency: number;
  start: number;
  duration: number;
  gain: number;
  attack?: number;
  detune?: number;
};

type CompletionSoundPreset = {
  masterGain: number;
  release: number;
  events: SoundEvent[];
};

export const RESULTS_COMPLETE_SOUND_STORAGE_KEY = 'results_complete_sound';
export const DEFAULT_COMPLETION_SOUND_ID: CompletionSoundId = 'glass-rise';

export const COMPLETION_SOUND_OPTIONS: CompletionSoundOption[] = [
  {
    id: 'glass-rise',
    label: 'Glass Rise',
    description: 'Airy and modern with a bright upward cadence.',
  },
  {
    id: 'gentle-bell',
    label: 'Gentle Bell',
    description: 'Soft bell tone with a calm finish.',
  },
  {
    id: 'warm-marimba',
    label: 'Warm Marimba',
    description: 'Rounded, organic marimba taps.',
  },
  {
    id: 'bright-pulse',
    label: 'Bright Pulse',
    description: 'Quick punchy pulse for fast feedback.',
  },
  {
    id: 'classic-chime',
    label: 'Classic Chime',
    description: 'The previous long dual-sine chime.',
  },
  {
    id: 'off',
    label: 'Off',
    description: 'Disable completion sounds.',
  },
];

const COMPLETION_SOUND_PRESETS: Record<PlayableCompletionSoundId, CompletionSoundPreset> = {
  'glass-rise': {
    masterGain: 0.9,
    release: 0.15,
    events: [
      { type: 'triangle', frequency: 783.99, start: 0, duration: 0.26, gain: 0.11, attack: 0.02 },
      { type: 'sine', frequency: 1046.5, start: 0.14, duration: 0.28, gain: 0.1, attack: 0.02 },
      { type: 'sine', frequency: 1318.51, start: 0.29, duration: 0.34, gain: 0.08, attack: 0.02 },
    ],
  },
  'gentle-bell': {
    masterGain: 0.85,
    release: 0.22,
    events: [
      { type: 'sine', frequency: 659.25, start: 0, duration: 0.34, gain: 0.11, attack: 0.03 },
      { type: 'triangle', frequency: 880, start: 0.18, duration: 0.4, gain: 0.08, attack: 0.03 },
      { type: 'sine', frequency: 987.77, start: 0.36, duration: 0.46, gain: 0.06, attack: 0.04 },
    ],
  },
  'warm-marimba': {
    masterGain: 0.9,
    release: 0.1,
    events: [
      { type: 'triangle', frequency: 392, start: 0, duration: 0.2, gain: 0.1, detune: -4 },
      { type: 'triangle', frequency: 523.25, start: 0.11, duration: 0.22, gain: 0.09, detune: -2 },
      { type: 'triangle', frequency: 659.25, start: 0.22, duration: 0.24, gain: 0.08 },
    ],
  },
  'bright-pulse': {
    masterGain: 0.85,
    release: 0.08,
    events: [
      { type: 'square', frequency: 784, start: 0, duration: 0.11, gain: 0.045, attack: 0.01 },
      { type: 'square', frequency: 1046.5, start: 0.12, duration: 0.12, gain: 0.045, attack: 0.01 },
      { type: 'triangle', frequency: 1318.51, start: 0.24, duration: 0.16, gain: 0.06, attack: 0.01 },
    ],
  },
  'classic-chime': {
    masterGain: 1,
    release: 0.18,
    events: [
      { type: 'sine', frequency: 1046.5, start: 0, duration: 2, gain: 0.12, attack: 0.05 },
      { type: 'sine', frequency: 1318.51, start: 0, duration: 2, gain: 0.12, attack: 0.05 },
    ],
  },
};

const COMPLETION_SOUND_ID_SET = new Set<CompletionSoundId>(
  COMPLETION_SOUND_OPTIONS.map((option) => option.id)
);

const isLocalStorageAvailable = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

export const isCompletionSoundId = (value: unknown): value is CompletionSoundId => {
  return typeof value === 'string' && COMPLETION_SOUND_ID_SET.has(value as CompletionSoundId);
};

export const getStoredCompletionSoundId = (): CompletionSoundId => {
  if (!isLocalStorageAvailable()) {
    console.log('[completion-sound] localStorage unavailable; using default sound.', {
      fallbackSoundId: DEFAULT_COMPLETION_SOUND_ID,
    });
    return DEFAULT_COMPLETION_SOUND_ID;
  }

  try {
    const rawValue = window.localStorage.getItem(RESULTS_COMPLETE_SOUND_STORAGE_KEY);
    if (isCompletionSoundId(rawValue)) {
      console.log('[completion-sound] Loaded saved completion sound.', { soundId: rawValue });
      return rawValue;
    }

    if (rawValue) {
      console.log('[completion-sound] Ignoring unknown saved completion sound and using default.', {
        rawValue,
        fallbackSoundId: DEFAULT_COMPLETION_SOUND_ID,
      });
    }

    return DEFAULT_COMPLETION_SOUND_ID;
  } catch (error) {
    console.log('[completion-sound] Failed to read localStorage sound setting; using default.', {
      fallbackSoundId: DEFAULT_COMPLETION_SOUND_ID,
      error,
    });
    return DEFAULT_COMPLETION_SOUND_ID;
  }
};

export const saveCompletionSoundId = (soundId: CompletionSoundId): void => {
  if (!isCompletionSoundId(soundId)) {
    console.log('[completion-sound] Ignoring invalid completion sound id.', { soundId });
    return;
  }

  if (!isLocalStorageAvailable()) {
    console.log('[completion-sound] localStorage unavailable; skipping sound preference save.', {
      soundId,
    });
    return;
  }

  try {
    window.localStorage.setItem(RESULTS_COMPLETE_SOUND_STORAGE_KEY, soundId);
    console.log('[completion-sound] Saved completion sound preference.', { soundId });
  } catch (error) {
    console.log('[completion-sound] Failed to persist completion sound preference.', {
      soundId,
      error,
    });
  }
};

const getAudioContextConstructor = (): (new () => AudioContext) | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const constructor =
    window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!constructor) {
    console.log('[completion-sound] Web Audio API unavailable in this environment.');
    return null;
  }

  return constructor;
};

export const playCompletionSound = async (soundId: CompletionSoundId): Promise<void> => {
  if (soundId === 'off') {
    console.log('[completion-sound] Completion sound disabled by user preference.');
    return;
  }

  const soundPreset = COMPLETION_SOUND_PRESETS[soundId];
  if (!soundPreset) {
    console.log('[completion-sound] Missing sound preset. Falling back to default.', {
      soundId,
      fallbackSoundId: DEFAULT_COMPLETION_SOUND_ID,
    });
    return playCompletionSound(DEFAULT_COMPLETION_SOUND_ID);
  }

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return;
  }

  let audioContext: AudioContext | null = null;

  try {
    audioContext = new AudioContextConstructor();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const now = audioContext.currentTime;
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(soundPreset.masterGain, now);
    masterGain.connect(audioContext.destination);

    let maxEndOffset = 0;

    soundPreset.events.forEach((event) => {
      const oscillator = audioContext!.createOscillator();
      const noteGain = audioContext!.createGain();
      const eventStart = now + event.start;
      const attackDuration = event.attack ?? 0.02;
      const eventEnd = eventStart + event.duration;
      const eventStop = eventEnd + soundPreset.release;

      oscillator.type = event.type;
      oscillator.frequency.setValueAtTime(event.frequency, eventStart);
      if (typeof event.detune === 'number') {
        oscillator.detune.setValueAtTime(event.detune, eventStart);
      }

      noteGain.gain.setValueAtTime(0.0001, eventStart);
      noteGain.gain.linearRampToValueAtTime(event.gain, eventStart + attackDuration);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, eventEnd);

      oscillator.connect(noteGain);
      noteGain.connect(masterGain);

      oscillator.start(eventStart);
      oscillator.stop(eventStop);

      maxEndOffset = Math.max(maxEndOffset, event.start + event.duration + soundPreset.release);
    });

    const closeAfterMs = Math.max(400, Math.ceil(maxEndOffset * 1000) + 100);
    window.setTimeout(() => {
      if (!audioContext) {
        return;
      }
      void audioContext.close().catch((closeError) => {
        console.log('[completion-sound] Failed to close audio context cleanly.', { closeError });
      });
    }, closeAfterMs);

    console.log('[completion-sound] Played completion sound preset.', {
      soundId,
      eventCount: soundPreset.events.length,
    });
  } catch (error) {
    console.log('[completion-sound] Failed to play completion sound.', {
      soundId,
      error,
    });

    if (audioContext) {
      try {
        await audioContext.close();
      } catch (closeError) {
        console.log('[completion-sound] Failed to close audio context after play failure.', {
          closeError,
        });
      }
    }
  }
};
