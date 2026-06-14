// A fully generative soundscape (no audio files): an evolving cosmic-ambient
// pad for the constellation, a crowd murmur that shifts from a lively lobby to
// a hushed gallery interior, and footsteps. Everything is synthesised with the
// Web Audio API so it is licence-free and self-contained.

export type Scene = "constellation" | "gallery" | "off";

const DRONE_FREQS = [55, 82.41, 110, 164.81, 246.94]; // A1 E2 A2 E3 B3 — open & spacious
const BELL_NOTES = [220, 261.63, 329.63, 392.0, 440, 523.25, 659.25];

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private oscillators: OscillatorNode[] = [];
  private starters: (() => void)[] = [];

  private musicGain: GainNode;
  private musicFilter: BiquadFilterNode;
  private ambGain: GainNode;
  private lobbyGain: GainNode;
  private interiorGain: GainNode;
  private noiseBuf: AudioBuffer;

  private scene: Scene = "off";
  private volume = 0.55;
  private muted = false;
  private started = false;
  private bellTimer = 0;
  private voiceTimer = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    this.noiseBuf = this.makeNoise(3);
    const m = this.buildMusic();
    this.musicGain = m.gain;
    this.musicFilter = m.filter;
    const a = this.buildAmbience();
    this.ambGain = a.gain;
    this.lobbyGain = a.lobby;
    this.interiorGain = a.interior;
  }

  private makeNoise(sec: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    return buf;
  }

  private buildMusic() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    // a long feedback delay for a cathedral-of-the-sky reverb
    const delay = this.ctx.createDelay(2);
    delay.delayTime.value = 0.55;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.55;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.45;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(gain);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    filter.Q.value = 1.5;
    filter.connect(gain);
    filter.connect(delay);

    DRONE_FREQS.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i > 2 ? "triangle" : "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.13 / (i + 1.2);
      o.connect(g);
      g.connect(filter);
      this.oscillators.push(o);

      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.08;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 3 + i * 2;
      lfo.connect(lfoG);
      lfoG.connect(o.detune);
      this.oscillators.push(lfo);
    });

    const fLfo = this.ctx.createOscillator();
    fLfo.frequency.value = 0.025;
    const fLfoG = this.ctx.createGain();
    fLfoG.gain.value = 320;
    fLfo.connect(fLfoG);
    fLfoG.connect(filter.frequency);
    this.oscillators.push(fLfo);

    return { gain, filter };
  }

  private buildAmbience() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.starters.push(() => src.start());

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    src.connect(bp);

    // amplitude wobble → the swell of many voices
    const am = this.ctx.createGain();
    am.gain.value = 0.6;
    bp.connect(am);
    const amLfo = this.ctx.createOscillator();
    amLfo.type = "sine";
    amLfo.frequency.value = 0.6;
    const amLfoG = this.ctx.createGain();
    amLfoG.gain.value = 0.35;
    amLfo.connect(amLfoG);
    amLfoG.connect(am.gain);
    this.oscillators.push(amLfo);

    // lobby: brighter, livelier, with a little echo
    const lobby = this.ctx.createGain();
    lobby.gain.value = 1;
    const lobbyHp = this.ctx.createBiquadFilter();
    lobbyHp.type = "highpass";
    lobbyHp.frequency.value = 320;
    const lobbyLevel = this.ctx.createGain();
    lobbyLevel.gain.value = 0.2;
    am.connect(lobbyHp);
    lobbyHp.connect(lobby);
    lobby.connect(lobbyLevel);
    lobbyLevel.connect(gain);
    const lobbyDelay = this.ctx.createDelay(0.5);
    lobbyDelay.delayTime.value = 0.18;
    const lobbyEcho = this.ctx.createGain();
    lobbyEcho.gain.value = 0.25;
    lobby.connect(lobbyDelay);
    lobbyDelay.connect(lobbyEcho);
    lobbyEcho.connect(gain);

    // interior: muffled and quiet (people keeping their voices down)
    const interior = this.ctx.createGain();
    interior.gain.value = 0;
    const intLp = this.ctx.createBiquadFilter();
    intLp.type = "lowpass";
    intLp.frequency.value = 650;
    const intLevel = this.ctx.createGain();
    intLevel.gain.value = 0.1;
    am.connect(intLp);
    intLp.connect(interior);
    interior.connect(intLevel);
    intLevel.connect(gain);

    return { gain, lobby, interior };
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await this.ctx.resume();
    } catch {}
    const now = this.ctx.currentTime + 0.05;
    for (const o of this.oscillators) {
      try {
        o.start(now);
      } catch {}
    }
    for (const s of this.starters) {
      try {
        s();
      } catch {}
    }
    this.scheduleBell();
    this.scheduleVoice();
    this.applyScene(0.8);
  }

  private scheduleBell = () => {
    if (this.scene === "constellation" && !this.muted) {
      const f =
        BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)] *
        (Math.random() < 0.25 ? 2 : 1);
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      o.connect(g);
      g.connect(this.musicFilter);
      o.start(t);
      o.stop(t + 3.7);
    }
    this.bellTimer = window.setTimeout(
      this.scheduleBell,
      4500 + Math.random() * 7000,
    );
  };

  // sparse soft "voice" swells for the lobby murmur
  private scheduleVoice = () => {
    if (this.scene === "gallery" && !this.muted) {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 500 + Math.random() * 900;
      f.Q.value = 5;
      const g = this.ctx.createGain();
      const peak = 0.05 * (1 - this.interiorGain.gain.value * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      src.connect(f);
      f.connect(g);
      g.connect(this.ambGain);
      src.start(t, Math.random() * 2);
      src.stop(t + 1);
    }
    this.voiceTimer = window.setTimeout(
      this.scheduleVoice,
      900 + Math.random() * 1800,
    );
  };

  private applyScene(dur: number) {
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.ambGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(
      this.scene === "constellation" ? 1 : 0,
      t + dur,
    );
    this.ambGain.gain.linearRampToValueAtTime(
      this.scene === "gallery" ? 1 : 0,
      t + dur,
    );
  }

  setScene(s: Scene) {
    if (this.scene === s) return;
    this.scene = s;
    if (this.started) this.applyScene(1.6);
  }

  setGalleryDepth(d: number) {
    const v = Math.max(0, Math.min(1, d));
    const t = this.ctx.currentTime;
    this.lobbyGain.gain.setTargetAtTime(1 - v, t, 0.5);
    this.interiorGain.gain.setTargetAtTime(v, t, 0.5);
  }

  step() {
    if (!this.started || this.scene !== "gallery" || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600 + Math.random() * 350;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(this.ambGain);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.14);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.volume,
      this.ctx.currentTime,
      0.05,
    );
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.master.gain.setTargetAtTime(
      m ? 0 : this.volume,
      this.ctx.currentTime,
      0.05,
    );
  }

  dispose() {
    window.clearTimeout(this.bellTimer);
    window.clearTimeout(this.voiceTimer);
    try {
      this.ctx.close();
    } catch {}
  }
}
