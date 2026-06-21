// A layered, immersive soundscape:
//  · Cinematic arc (#5): a cosmic pad in the constellation morphs into a warm,
//    thinning pad in the gallery, then narrows to a sustained binaural tone when
//    you stand before a single artwork — the world falling away around it.
//  · Hushed realism (#1): a real (public-domain) crowd murmur greets you at the
//    entrance and muffles as you turn into the room and walk deeper; synthesised
//    footsteps on a hard floor; a faint hushed room-tone.
//  · The art sings (#4): in the art view, each painting summons a soundscape
//    drawn from its subject — surf, wind and birds, a café, rain, a fire.
// The only sample is the crowd (licence-clean); everything else is synthesised.

export type Scene = "constellation" | "gallery" | "artview" | "off";

const DRONE_FREQS = [55, 82.41, 110, 164.81, 246.94];
const BELL_NOTES = [220, 261.63, 329.63, 392.0, 440, 523.25, 659.25];

export type ArtSubject =
  | "sea"
  | "landscape"
  | "city"
  | "rain"
  | "fire"
  | "snow"
  | "quiet";

// A built soundscape (its live nodes + scheduled-event timers) feeding one bus.
type Scape = {
  out: GainNode;
  nodes: AudioScheduledSourceNode[];
  timers: number[];
  subject: ArtSubject | null;
};

// Guess a painting's sonic subject from its title + story.
export function classifySubject(text: string): ArtSubject {
  const t = text.toLowerCase();
  const has = (...w: string[]) => w.some((k) => t.includes(k));
  if (has("sea", "ocean", "wave", "beach", "coast", "harbour", "harbor", "port", "ship", "boat", "marine", "cliff", "tide", "bay", "regatta", "sail"))
    return "sea";
  if (has("snow", "winter", "frost", "ice", "blizzard"))
    return "snow";
  if (has("rain", "storm", "shower", "wet", "umbrella"))
    return "rain";
  if (has("fire", "night", "candle", "lamp", "burning", "flame", "torch", "nocturne"))
    return "fire";
  if (has("garden", "field", "meadow", "forest", "wood", "tree", "haystack", "poppy", "country", "valley", "hill", "river", "pond", "lily", "spring", "harvest", "wheat", "landscape", "park"))
    return "landscape";
  if (has("boulevard", "street", "city", "paris", "café", "cafe", "terrace", "station", "square", "crowd", "ball", "dance", "bar", "moulin", "town"))
    return "city";
  return "quiet";
}

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private oscillators: OscillatorNode[] = [];
  private starters: (() => void)[] = [];

  // buses
  private cosmicGain: GainNode; // constellation pad + bells
  private cosmicFilter: BiquadFilterNode;
  private galleryGain: GainNode; // crowd + room-tone + footsteps
  private artGain: GainNode; // binaural tone + art soundscape

  // crowd (sample)
  private crowdGain: GainNode;
  private crowdLP: BiquadFilterNode;
  private crowdBuf: AudioBuffer | null = null;
  private crowdSrc: AudioBufferSourceNode | null = null;

  // entrance vernissage: a laughter layer + a transient bus to master
  private entryBuf: AudioBuffer | null = null;
  private entrySrcs: AudioBufferSourceNode[] = [];

  // room-tone (synth)
  private roomToneGain: GainNode;

  // binaural tone (art view)
  private binauralGain: GainNode;

  // dynamic art soundscapes — `art` is the full one heard in the art view; `near`
  // is a faint, panned hint of the nearest work as you roam the gallery.
  private artScape: GainNode;
  private nearScape: GainNode;
  private nearPan: StereoPannerNode;
  private nearGain: GainNode;
  private art: Scape;
  private near: Scape;

  // room reverb, its wet level scaled to the hall's size
  private verbSend: GainNode;
  private verbWet: GainNode;

  private pinkBuf: AudioBuffer;
  private whiteBuf: AudioBuffer;

  private scene: Scene = "off";
  private facing = 0; // 0 = looking at the entrance, 1 = into the room
  private depth = 0; // 0 = at the door, 1 = deep in the room
  private volume = 0.55;
  private muted = false;
  private ducked = false;
  private started = false;
  private bellTimer = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    this.pinkBuf = this.makeNoise(3, "pink");
    this.whiteBuf = this.makeNoise(3, "white");

    // ---- cosmic pad (constellation) ----
    this.cosmicGain = this.ctx.createGain();
    this.cosmicGain.gain.value = 0;
    this.cosmicGain.connect(this.master);
    this.cosmicFilter = this.buildCosmic(this.cosmicGain);

    // ---- gallery bus ----
    this.galleryGain = this.ctx.createGain();
    this.galleryGain.gain.value = 0;
    this.galleryGain.connect(this.master);

    this.crowdLP = this.ctx.createBiquadFilter();
    this.crowdLP.type = "lowpass";
    this.crowdLP.frequency.value = 1800;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.0001;
    this.crowdLP.connect(this.crowdGain);
    this.crowdGain.connect(this.galleryGain);

    this.roomToneGain = this.ctx.createGain();
    this.roomToneGain.gain.value = 0;
    this.roomToneGain.connect(this.galleryGain);
    this.buildRoomTone(this.roomToneGain);

    // ---- art view bus ----
    this.artGain = this.ctx.createGain();
    this.artGain.gain.value = 0;
    this.artGain.connect(this.master);

    this.binauralGain = this.ctx.createGain();
    this.binauralGain.gain.value = 0;
    this.binauralGain.connect(this.artGain);
    this.buildBinaural(this.binauralGain);

    this.artScape = this.ctx.createGain();
    this.artScape.gain.value = 0.9;
    this.artScape.connect(this.artGain);
    this.art = { out: this.artScape, nodes: [], timers: [], subject: null };

    // near-work spatial hint: its soundscape → panner → faint gain → gallery bus
    this.nearScape = this.ctx.createGain();
    this.nearScape.gain.value = 1;
    this.nearPan = this.ctx.createStereoPanner();
    this.nearGain = this.ctx.createGain();
    this.nearGain.gain.value = 0.0001;
    this.nearScape.connect(this.nearPan);
    this.nearPan.connect(this.nearGain);
    this.nearGain.connect(this.galleryGain);
    this.near = { out: this.nearScape, nodes: [], timers: [], subject: null };

    // ---- room reverb (parallel wet send off the room + art buses) ----
    this.verbSend = this.ctx.createGain();
    this.verbSend.gain.value = 1;
    const verb = this.ctx.createConvolver();
    verb.buffer = this.makeIR(1.8, 2.6);
    this.verbWet = this.ctx.createGain();
    this.verbWet.gain.value = 0.0001;
    this.verbSend.connect(verb);
    verb.connect(this.verbWet);
    this.verbWet.connect(this.master);
    this.galleryGain.connect(this.verbSend);
    this.artGain.connect(this.verbSend);

    this.loadCrowd();
    this.loadLaughter();
  }

  // a simple decaying-noise impulse response — a believable stone-hall tail
  private makeIR(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // ---- buffers ----------------------------------------------------------
  private makeNoise(sec: number, kind: "pink" | "white"): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") {
        data[i] = white * 0.5;
      } else {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
      }
    }
    return buf;
  }

  private async loadCrowd() {
    try {
      const res = await fetch("/audio/crowd.mp3");
      const arr = await res.arrayBuffer();
      this.crowdBuf = await this.ctx.decodeAudioData(arr);
      if (this.started) this.startCrowd();
    } catch {}
  }

  private async loadLaughter() {
    try {
      const res = await fetch("/audio/laughter.mp3");
      const arr = await res.arrayBuffer();
      this.entryBuf = await this.ctx.decodeAudioData(arr);
    } catch {}
  }

  private startCrowd() {
    if (!this.crowdBuf || this.crowdSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.crowdBuf;
    src.loop = true;
    src.connect(this.crowdLP);
    try {
      src.start();
    } catch {}
    this.crowdSrc = src;
  }

  // ---- builders ---------------------------------------------------------
  private buildCosmic(out: GainNode): BiquadFilterNode {
    const delay = this.ctx.createDelay(2);
    delay.delayTime.value = 0.55;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.55;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.45;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(out);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    filter.Q.value = 1.5;
    filter.connect(out);
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

    return filter;
  }

  private buildRoomTone(out: GainNode) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkBuf;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    this.starters.push(() => src.start());
  }

  private buildBinaural(out: GainNode) {
    // a warm sustained tone split into two slightly detuned ears
    const base = 146.83; // D3
    [
      { pan: -1, det: -3 },
      { pan: 1, det: 3 },
    ].forEach(({ pan, det }) => {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base;
      o.detune.value = det;
      const o2 = this.ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = base * 2;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.12;
      o2.connect(g2);
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g2.connect(g);
      g.connect(panner);
      panner.connect(out);
      this.oscillators.push(o, o2);
    });
  }

  // ---- lifecycle --------------------------------------------------------
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
    this.startCrowd();
    this.scheduleBell();
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
      g.connect(this.cosmicFilter);
      o.start(t);
      o.stop(t + 3.7);
    }
    this.bellTimer = window.setTimeout(
      this.scheduleBell,
      4500 + Math.random() * 7000,
    );
  };

  // ---- scene + spatial --------------------------------------------------
  private applyScene(dur: number) {
    const t = this.ctx.currentTime;
    const ramp = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.linearRampToValueAtTime(v, t + dur);
    };
    ramp(this.cosmicGain, this.scene === "constellation" ? 1 : 0);
    // the pad thins (not silent) in the gallery, near-silent in the art view
    ramp(
      this.galleryGain,
      this.scene === "gallery" ? 1 : this.scene === "artview" ? 0.32 : 0,
    );
    ramp(this.artGain, this.scene === "artview" ? 1 : 0);
    ramp(this.binauralGain, this.scene === "artview" ? 0.16 : 0);
    this.applySpatial(dur);
  }

  // crowd brightness/level from where you're looking + how deep you are
  private applySpatial(dur = 0.4) {
    const t = this.ctx.currentTime;
    const near = 1 - this.facing; // loud when facing the entrance
    const open = Math.max(0, near) * (1 - 0.55 * this.depth);
    const audible = this.scene === "gallery" || this.scene === "artview";
    const level = audible ? 0.03 + open * 0.16 : 0;
    const cutoff = 380 + open * 2200;
    this.crowdGain.gain.setTargetAtTime(level, t, dur);
    this.crowdLP.frequency.setTargetAtTime(cutoff, t, dur);
    // the hush rises as the crowd falls
    const room = audible ? 0.04 + (1 - open) * 0.06 : 0;
    this.roomToneGain.gain.setTargetAtTime(room, t, dur);
  }

  setScene(s: Scene) {
    if (this.scene === s) return;
    const wasArt = this.scene === "artview";
    this.scene = s;
    if (s !== "artview" && wasArt) this.setArtwork(null);
    if (this.started) this.applyScene(1.4);
  }

  setFacing(f: number) {
    this.facing = Math.max(0, Math.min(1, f));
    if (this.started) this.applySpatial();
  }

  setDepth(d: number) {
    this.depth = Math.max(0, Math.min(1, d));
    if (this.started) this.applySpatial();
  }

  // wet level grows with the hall — an intimate room stays dry, a nave rings
  setRoomSize(depthMeters: number) {
    const wet = Math.max(0.06, Math.min(0.34, (depthMeters - 14) / 60 + 0.08));
    if (this.started) {
      this.verbWet.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.6);
    } else {
      this.verbWet.gain.value = wet;
    }
  }

  // The vernissage at the threshold: a loud, bright crowd (chatter + laughter)
  // that ducks and muffles as you push through the door into the hush. Runs on
  // its own transient bus straight to master, so it plays regardless of the
  // current scene (the entry happens while still in the constellation).
  enterTransition(durationS = 3.6) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    lp.connect(g);
    g.connect(this.master);

    const play = (buf: AudioBuffer, gain: number, offset: number) => {
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const sg = this.ctx.createGain();
      sg.gain.value = gain;
      s.connect(sg);
      sg.connect(lp);
      try {
        s.start(t, offset % Math.max(0.1, buf.duration - 0.5));
      } catch {}
      this.entrySrcs.push(s);
    };
    if (this.crowdBuf) play(this.crowdBuf, 0.9, Math.random() * 8);
    if (this.entryBuf) play(this.entryBuf, 1.0, 0);

    // loud + bright now → ducked + muffled as you cross the threshold
    g.gain.linearRampToValueAtTime(0.5, t + 0.06);
    g.gain.linearRampToValueAtTime(0.5, t + durationS * 0.5);
    g.gain.linearRampToValueAtTime(0.09, t + durationS);
    g.gain.linearRampToValueAtTime(0.0001, t + durationS + 0.8);
    lp.frequency.linearRampToValueAtTime(4200, t + durationS * 0.45);
    lp.frequency.linearRampToValueAtTime(470, t + durationS);

    const stopAt = t + durationS + 1.0;
    const dead = this.entrySrcs;
    this.entrySrcs = [];
    for (const s of dead) {
      try {
        s.stop(stopAt);
      } catch {}
    }
    window.setTimeout(
      () => {
        try {
          g.disconnect();
        } catch {}
      },
      (durationS + 1.4) * 1000,
    );
  }

  step() {
    if (!this.started || this.scene !== "gallery" || this.muted) return;
    const t = this.ctx.currentTime;
    // a low body thump
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.09);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.13, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(og);
    og.connect(this.galleryGain);
    o.start(t);
    o.stop(t + 0.15);
    // a short scuff of the sole on the floor
    const src = this.ctx.createBufferSource();
    src.buffer = this.whiteBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2400 + Math.random() * 1200;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f);
    f.connect(g);
    g.connect(this.galleryGain);
    src.start(t, Math.random() * 2);
    src.stop(t + 0.08);
  }

  // ---- the art sings ----------------------------------------------------
  // The full soundscape heard standing before a work (in the art view).
  setArtwork(subject: ArtSubject | null) {
    if (subject === this.art.subject) return;
    this.teardownScape(this.art);
    this.art.subject = subject;
    if (subject && subject !== "quiet") this.buildScape(subject, this.art);
  }

  // The nearest work as you roam: its soundscape, panned to the side it hangs on
  // and rising as you approach. Faint, and only in the gallery (the art view
  // already carries the full soundscape).
  setNearWork(subject: ArtSubject | null, pan: number, level: number) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    if (subject !== this.near.subject) {
      this.teardownScape(this.near);
      this.near.subject = subject;
      if (subject && subject !== "quiet") this.buildScape(subject, this.near);
    }
    this.nearPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.15);
    const eff =
      this.scene === "gallery" && subject && subject !== "quiet"
        ? Math.max(0.0001, Math.min(0.4, level))
        : 0.0001;
    this.nearGain.gain.setTargetAtTime(eff, t, 0.25);
  }

  private teardownScape(s: Scape) {
    for (const n of s.nodes) {
      try {
        n.stop();
      } catch {}
    }
    s.nodes = [];
    for (const id of s.timers) window.clearTimeout(id);
    s.timers = [];
  }

  private noiseInto(buf: AudioBuffer, s: Scape): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    try {
      src.start(this.ctx.currentTime, Math.random() * 2);
    } catch {}
    s.nodes.push(src);
    return src;
  }

  private buildScape(subject: ArtSubject, s: Scape) {
    const out = s.out;
    if (subject === "sea") {
      // surf: low filtered noise with slow swells
      const src = this.noiseInto(this.pinkBuf, s);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 520;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.4;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      lfo.start();
      s.nodes.push(lfo);
      src.connect(lp);
      lp.connect(g);
      g.connect(out);
    } else if (subject === "landscape") {
      // wind + occasional birdsong
      const src = this.noiseInto(this.pinkBuf, s);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 540;
      bp.Q.value = 0.6;
      const g = this.ctx.createGain();
      g.gain.value = 0.3;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 260;
      lfo.connect(lfoG);
      lfoG.connect(bp.frequency);
      lfo.start();
      s.nodes.push(lfo);
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
      this.scheduleBird(s);
    } else if (subject === "city") {
      // a distant café/boulevard murmur (reuse the crowd, muffled)
      if (this.crowdBuf) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.crowdBuf;
        src.loop = true;
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        const g = this.ctx.createGain();
        g.gain.value = 0.5;
        src.connect(lp);
        lp.connect(g);
        g.connect(out);
        try {
          src.start(this.ctx.currentTime, Math.random() * 10);
        } catch {}
        s.nodes.push(src);
      }
    } else if (subject === "rain") {
      const src = this.noiseInto(this.whiteBuf, s);
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const g = this.ctx.createGain();
      g.gain.value = 0.18;
      src.connect(hp);
      hp.connect(g);
      g.connect(out);
      this.scheduleDrip(s);
    } else if (subject === "fire") {
      const src = this.noiseInto(this.pinkBuf, s);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.value = 0.28;
      src.connect(lp);
      lp.connect(g);
      g.connect(out);
      this.scheduleCrackle(s);
    } else if (subject === "snow") {
      const src = this.noiseInto(this.pinkBuf, s);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 0.4;
      const g = this.ctx.createGain();
      g.gain.value = 0.12;
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
    }
  }

  private scheduleBird(s: Scape) {
    const out = s.out;
    const tick = () => {
      if (s.subject !== "landscape") return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "sine";
      const f0 = 2200 + Math.random() * 1800;
      o.frequency.setValueAtTime(f0, t);
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 1; i <= notes; i++) {
        o.frequency.setValueAtTime(f0 * (1 + (Math.random() - 0.5) * 0.4), t + i * 0.07);
      }
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + notes * 0.07 + 0.05);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + notes * 0.07 + 0.1);
      s.timers.push(window.setTimeout(tick, 1800 + Math.random() * 4500));
    };
    s.timers.push(window.setTimeout(tick, 600 + Math.random() * 1500));
  }

  private scheduleDrip(s: Scape) {
    const out = s.out;
    const tick = () => {
      if (s.subject !== "rain") return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(900 + Math.random() * 700, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.06);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.1);
      s.timers.push(window.setTimeout(tick, 120 + Math.random() * 480));
    };
    s.timers.push(window.setTimeout(tick, 200));
  }

  private scheduleCrackle(s: Scape) {
    const out = s.out;
    const tick = () => {
      if (s.subject !== "fire") return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.whiteBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.06, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(hp);
      hp.connect(g);
      g.connect(out);
      src.start(t, Math.random() * 2);
      src.stop(t + 0.05);
      s.timers.push(window.setTimeout(tick, 60 + Math.random() * 380));
    };
    s.timers.push(window.setTimeout(tick, 100));
  }

  // ---- controls ---------------------------------------------------------
  private applyMaster() {
    const target = this.muted ? 0 : this.volume * (this.ducked ? 0.22 : 1);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }

  // lower the soundscape while a narration plays over it
  setDucked(d: boolean) {
    this.ducked = d;
    this.applyMaster();
  }

  dispose() {
    window.clearTimeout(this.bellTimer);
    for (const id of this.art.timers) window.clearTimeout(id);
    for (const id of this.near.timers) window.clearTimeout(id);
    try {
      this.ctx.close();
    } catch {}
  }
}
