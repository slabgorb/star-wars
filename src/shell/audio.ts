// src/shell/audio.ts
//
// Story 8-7 / SH2-17: star-wars' SFX manifest + engine constructor, plus its TMS5220
// LPC speech subsystem. The WebAudio SFX ENGINE (lazy AudioContext, master gain, buffer
// load/decode, POKEY-style voice-stealing, silent degrade) was extracted to
// @arcade/shared/audio in SH2-16 and adopted here in SH2-17. This module keeps only
// star-wars' NUMBERS (the SOUNDS manifest, the CHANNELS voice map, the R2 base) and
// constructs the shared engine from them.
//
// Speech stays GAME-SIDE (design §4.2 — speech is a star-wars-only subsystem, out of
// scope for the shared SFX engine): the speak() loader keeps its own gesture-unlocked
// AudioContext (AC-3, "speech runs on its own context unchanged"). See the session's
// Design Deviations for why no context() accessor was added to the shared engine.
//
// This is IO (shell), not simulation (core): the pure core emits `GameEvent` DATA and
// never imports this module (CLAUDE.md hard boundary). Every SFX failure mode degrades
// silently — that behaviour now lives in the shared engine; speech degrades silently
// the same way.
import {
  createAudioEngine as createSharedAudioEngine,
  type AudioEngine as SharedAudioEngine,
} from '@arcade/shared/audio'

// star-wars SFX live under their own prefix on the shared arcade assets host,
// mirroring tempest's '/tempest/sfx/' layout. AUTHENTIC POKEY bakes from the arcade ROM.
const DEFAULT_BASE_URL = 'https://arcade-assets.slabgorb.com/star-wars/sfx/'

// Logical sound name -> R2 filename (per-cabinet NUMBERS). Keyed to the gameplay moments
// the 8-7 `GameEvent` channel reports, so the event->sound wiring is a thin lookup.
const SOUNDS = {
  fire: 'player_fire.wav', // player laser cannon
  enemyFire: 'enemy_fire.wav', // a TIE / turret loosed a fireball
  enemyDeath: 'enemy_explosion.wav', // a TIE or turret was destroyed
  playerDeath: 'player_explosion.wav', // the ship lost a shield to hostile fire
  levelClear: 'wave_clear.wav', // phase quota met — the run advances
  playerSpawn: 'spawn.wav', // a fresh run begins
  terrainCrash: 'terrain_crash.wav', // scraped the Death Star surface
} as const

export type SoundName = keyof typeof SOUNDS

// Logical playback channels (POKEY-style voice stealing, per SH2-17). Each SFX gets its
// OWN channel so distinct sounds never cut each other off; a rapid retrigger of the SAME
// sound cuts in rather than stacking — the cabinet-wide convergence onto the shared VERB
// (as tempest's 10-10). Keyed by SoundName, so a new manifest sound without a channel is
// a compile error.
const CHANNELS: Record<SoundName, string> = {
  fire: 'fire',
  enemyFire: 'enemy-fire',
  enemyDeath: 'enemy-death',
  playerDeath: 'player-death',
  levelClear: 'level-clear',
  playerSpawn: 'player-spawn',
  terrainCrash: 'terrain-crash',
}

// Looping music (sw3-5), under its own R2 prefix mirroring the sfx/ and speech/
// layout. AUTHENTIC POKEY music bakes from the arcade sound board (transcribed from
// historicalsource — findings ## Sound hooks). Track names match the core's
// `MusicTrack` union, so the event->startLoop wiring is a thin lookup.
const DEFAULT_MUSIC_BASE_URL = 'https://arcade-assets.slabgorb.com/star-wars/music/'

// Logical music track -> R2 filename (per-cabinet NUMBERS). One file per phase theme
// plus the Imperial March.
export const MUSIC = {
  space: 'space_theme.wav', // space wave — Sound_24/25
  towers: 'towers_theme.wav', // Death Star surface — Sound_20/21
  trench: 'trench_theme.wav', // trench run — Sound_22
  imperialMarch: 'imperial_march.wav', // replaces the space theme at wave>=3 odd — Sound_1D
} as const

export type MusicName = keyof typeof MUSIC

// Every track shares ONE logical channel, so starting a track voice-steals whatever
// was looping — exactly one music loop rings at a time and a phase edge swaps it
// (the looping music channel this story needs, per @arcade/shared/audio SH2-16).
const MUSIC_CHANNELS: Record<MusicName, string> = {
  space: 'music',
  towers: 'music',
  trench: 'music',
  imperialMarch: 'music',
}

// TMS5220 LPC speech (story 8-7), under its own R2 prefix. AUTHENTIC re-synthesis bakes
// of the cabinet's speech-ROM bitstreams. Speech samples are larger and rarely
// triggered, so unlike SFX they are loaded LAZILY (on first `speak()`), not eagerly.
const SPEECH_BASE_URL = 'https://arcade-assets.slabgorb.com/star-wars/speech/'

// The full 23-line cabinet catalogue (sw2-5). Keys are camelCase logical names; values
// are the exact baked R2 filenames (case-sensitive, snake_case), matching
// tools/speech-bake/speech-data.mjs. Lines the CORE currently cues are marked [wired].
export const SPEECH = {
  useTheForceLuke: 'use_the_force_luke.wav', // [wired] entering the trench
  redFiveStandingBy: 'red_five_standing_by.wav', // [wired] run start
  lookAtTheSizeOfThatThing: 'look_at_the_size_of_that_thing.wav', // [wired] enter surface
  greatShotKidThatWasOneInAMillion: 'great_shot_kid_that_was_one_in_a_million.wav', // [wired] port kill
  remember: 'remember.wav',
  imOnTheLeader: 'i_m_on_the_leader.wav',
  theForceIsStrongInThisOne: 'the_force_is_strong_in_this_one.wav',
  redFiveImGoingIn: 'red_five_i_m_going_in.wav',
  r2TryAndIncreaseThePower: 'r2_try_and_increase_the_power.wav',
  youreAllClearKid: 'you_re_all_clear_kid.wav',
  letGoLuke: 'let_go_luke.wav',
  vaderBreathing: 'vader_breathing.wav',
  yahoo: 'yahoo.wav',
  iHaveYouNow: 'i_have_you_now.wav',
  stayInAttackFormation: 'stay_in_attack_formation.wav',
  theForceWillBeWithYou: 'the_force_will_be_with_you.wav',
  always: 'always.wav',
  r2Scream: 'r2_scream.wav',
  tieFighter: 'tie_fighter.wav',
  imHitButNotBadR2SeeWhatYouCanDoWithIt: 'i_m_hit_but_not_bad_r2_see_what_you_can_do_with_it.wav',
  iveLostR2: 'i_ve_lost_r2.wav',
  iCantShakeHim: 'i_can_t_shake_him.wav',
  lukeTrustMe: 'luke_trust_me.wav',
} as const

export type SpeechName = keyof typeof SPEECH

export interface AudioEngine {
  // Create/resume the SFX AudioContext (and the speech context) and start loading SFX.
  // Safe to call repeatedly; only the first call does work.
  resume(): void
  // Play a loaded SFX sample once. No-op if not loaded, not ready, or unavailable.
  play(name: SoundName): void
  // Speak a TMS5220 line once, loading it lazily on first use. No-op if unavailable.
  speak(name: SpeechName): void
  // Start a looping music track on the shared `music` channel (sw3-5). Voice-steals
  // whatever was looping, so one track rings and a phase edge swaps it. No-op until
  // resume() has run and the track has decoded; silent when WebAudio is unavailable.
  startLoop(name: MusicName): void
  // Stop the looping music. Safe no-op when nothing is looping there.
  stopLoop(name: MusicName): void
  // True once at least one SFX sample has decoded. Mainly for tests / readiness UI.
  ready(): boolean
}

// Resolve the AudioContext constructor, covering the legacy `webkitAudioContext` prefix
// and non-browser environments. Kept for the game-side speech context (the SFX context
// is resolved inside the shared engine). `AudioContext` is a global ambient, not a
// `Window` member, so read it off `globalThis` with an explicit shape.
function getAudioContextCtor(): typeof AudioContext | undefined {
  const g = globalThis as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return g.AudioContext ?? g.webkitAudioContext
}

export function createAudioEngine(baseUrl: string = DEFAULT_BASE_URL): AudioEngine {
  // SFX run through the shared engine (SH2-16). It owns the SFX context, master gain,
  // buffer store, and voice-stealing — none of that is hand-rolled here anymore.
  const sfx: SharedAudioEngine<SoundName> = createSharedAudioEngine<SoundName>({
    baseUrl,
    sounds: SOUNDS,
    channels: CHANNELS,
  })

  // Looping music runs through its OWN shared-engine instance (sw3-5): a separate R2
  // prefix (music/) and a single `music` channel shared by every track, so startLoop
  // voice-steals to exactly one loop and a phase edge swaps it. Same silent-degrade
  // contract as the SFX engine — a missing/undecoded track simply never plays.
  const music: SharedAudioEngine<MusicName> = createSharedAudioEngine<MusicName>({
    baseUrl: DEFAULT_MUSIC_BASE_URL,
    sounds: MUSIC,
    channels: MUSIC_CHANNELS,
  })

  // Speech keeps its OWN gesture-unlocked context (AC-3). Larger, rarely-triggered
  // samples on a separate R2 prefix, loaded lazily on first speak(); its own master
  // gain preserves the 0.4 headroom the single-context version used.
  let speechCtx: AudioContext | null = null
  let speechMaster: GainNode | null = null
  const speechBuffers = new Map<SpeechName, AudioBuffer>()
  const speechLoading = new Set<SpeechName>()

  // Fire a decoded speech buffer through the speech master gain. Silent no-op / swallow
  // if the context isn't up or a single source fails.
  function playSpeech(buffer: AudioBuffer): void {
    if (!speechCtx || !speechMaster) return
    try {
      const source = speechCtx.createBufferSource()
      source.buffer = buffer
      source.connect(speechMaster)
      source.start()
    } catch {
      /* never let a single speech line crash the frame */
    }
  }

  function resume(): void {
    sfx.resume()
    music.resume()
    if (!speechCtx) {
      const Ctor = getAudioContextCtor()
      if (!Ctor) return // no WebAudio — speech stays inert (SFX handled the same way)
      try {
        speechCtx = new Ctor()
        speechMaster = speechCtx.createGain()
        speechMaster.gain.value = 0.4 // headroom, matches the pre-migration master
        speechMaster.connect(speechCtx.destination)
      } catch {
        speechCtx = null
        speechMaster = null
        return
      }
    }
    if (speechCtx.state === 'suspended') void speechCtx.resume()
  }

  function speak(name: SpeechName): void {
    if (!speechCtx) return // no context — stay silent
    const cached = speechBuffers.get(name)
    if (cached) {
      playSpeech(cached)
      return
    }
    if (speechLoading.has(name)) return // a fetch is already in flight; drop this cue
    speechLoading.add(name)
    const context = speechCtx
    fetch(SPEECH_BASE_URL + SPEECH[name])
      .then((res) => res.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        speechBuffers.set(name, buffer)
        playSpeech(buffer) // play the line that requested it, once decoded
      })
      .catch(() => {
        speechLoading.delete(name) // fetch/decode failed — allow a later retry, stay silent
      })
  }

  return {
    resume,
    play: (name: SoundName) => sfx.play(name),
    speak,
    startLoop: (name: MusicName) => music.startLoop(name),
    stopLoop: (name: MusicName) => music.stopLoop(name),
    ready: () => sfx.ready(),
  }
}
