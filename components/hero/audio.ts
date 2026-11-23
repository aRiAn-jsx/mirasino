/**
 * SOUND — synthesised, never sampled, so there is nothing to download and
 * nothing to loop-point by hand.
 *
 *   room tone   two decorrelated low-passed noise beds (≈ −40 dBFS) + a pair
 *               of sub-audible HVAC partials. The noise buffer is baked with
 *               an equal-power crossfade across its own seam, so it loops
 *               without a click.
 *   lamp        one relay contact (bright tick + armature thump + a quieter
 *               bounce), then a ballast hum that swells and settles.
 *   flip        band-passed air moved by cloth, and a soft landing.
 *
 * Browsers will not start audio unprompted: `arm()` must be called from a user
 * gesture. Until then every method is a silent no-op, and every interaction
 * is complete without it.
 */

type Ctx = AudioContext;

export class HeroAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private hum: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private enabled = true;

  get armed() {
    return this.ctx !== null;
  }

  /** call from a pointer/keyboard gesture */
  arm() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: Ctx;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    this.noise = this.bakeNoise(ctx, 11, 1.6);
    this.startRoom(ctx, master);
    this.startHum(ctx, master);
    master.gain.setTargetAtTime(this.enabled ? 1 : 0, ctx.currentTime, 0.6);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.12);
  }

  /** brown-ish noise with its tail cross-faded into its head */
  private bakeNoise(ctx: Ctx, seconds: number, fade: number) {
    const sr = ctx.sampleRate;
    const len = Math.floor(seconds * sr);
    const fl = Math.floor(fade * sr);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const raw = new Float32Array(len + fl);
      let last = 0;
      for (let i = 0; i < raw.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        raw[i] = last * 3.2;
      }
      const out = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        if (i < fl) {
          const t = i / fl;
          out[i] = raw[i] * Math.sin((t * Math.PI) / 2) + raw[len + i] * Math.cos((t * Math.PI) / 2);
        } else out[i] = raw[i];
      }
    }
    return buf;
  }

  private startRoom(ctx: Ctx, out: AudioNode) {
    const bed = (rate: number, type: BiquadFilterType, freq: number, q: number, gain: number, offset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(out);
      src.start(0, offset);
      this.nodes.push(src);
      return g;
    };
    // the room itself, then a thread of air higher up
    const low = bed(1, 'lowpass', 260, 0.3, 0.05, 0);
    bed(0.61, 'bandpass', 900, 0.5, 0.006, 3.7);

    // slow breathing of the low bed
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.012;
    lfo.connect(depth).connect(low.gain);
    lfo.start();
    this.nodes.push(lfo);

    // distant plant: two partials that beat very slowly
    for (const [f, g] of [
      [54, 0.011],
      [81.4, 0.005],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(out);
      o.start();
      this.nodes.push(o);
    }
  }

  private startHum(ctx: Ctx, out: AudioNode) {
    const hum = ctx.createGain();
    hum.gain.value = 0;
    hum.connect(out);
    for (const [f, g] of [
      [100, 1],
      [200, 0.35],
      [300, 0.12],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(hum);
      o.start();
      this.nodes.push(o);
    }
    this.hum = hum;
  }

  /** one relay contact */
  private relay(at: number, level: number, bright: number) {
    const ctx = this.ctx!;
    const out = this.master!;
    // contact tick
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.02);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
    n.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = bright;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = level * 0.5;
    n.connect(bp).connect(g).connect(out);
    n.start(at);
    // armature
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(bright * 0.06, at);
    o.frequency.exponentialRampToValueAtTime(bright * 0.028, at + 0.05);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, at);
    og.gain.exponentialRampToValueAtTime(level * 0.22, at + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(og).connect(out);
    o.start(at);
    o.stop(at + 0.1);
  }

  lampOn() {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime + 0.005;
    this.relay(t, 0.5, 3100);
    this.relay(t + 0.021, 0.16, 3600);
    const h = this.hum.gain;
    h.cancelScheduledValues(t);
    h.setValueAtTime(h.value, t);
    h.linearRampToValueAtTime(0.011, t + 0.45);
    h.setTargetAtTime(0.0028, t + 0.5, 0.7);
  }

  lampOff() {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime + 0.005;
    this.relay(t, 0.42, 2300);
    const h = this.hum.gain;
    h.cancelScheduledValues(t);
    h.setValueAtTime(h.value, t);
    h.setTargetAtTime(0, t, 0.09);
  }

  /** one key of the dark-room title: a felt-soft tick, barely there */
  key() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.002;
    const len = Math.floor(ctx.sampleRate * 0.012);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const n = ctx.createBufferSource();
    n.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700 + Math.random() * 500;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.value = 0.05 + Math.random() * 0.02;
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
  }

  /** cloth turned through air, then set down */
  flip() {
    if (!this.ctx || !this.noise || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;

    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.playbackRate.value = 2.6;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1150, t + 0.55);
    bp.frequency.exponentialRampToValueAtTime(320, t + 1.2);
    const ag = ctx.createGain();
    ag.gain.setValueAtTime(0.0001, t);
    ag.gain.exponentialRampToValueAtTime(0.42, t + 0.5);
    ag.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    air.connect(bp).connect(ag).connect(this.master);
    air.start(t, Math.random() * 5);
    air.stop(t + 1.4);

    // weave rubbing on itself: a brighter, quieter grain
    const rub = ctx.createBufferSource();
    rub.buffer = this.noise;
    rub.playbackRate.value = 5.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t + 0.1);
    rg.gain.exponentialRampToValueAtTime(0.09, t + 0.6);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    rub.connect(hp).connect(rg).connect(this.master);
    rub.start(t, Math.random() * 5);
    rub.stop(t + 1.3);

    // landing
    const land = t + 1.1;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(74, land);
    o.frequency.exponentialRampToValueAtTime(44, land + 0.14);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, land);
    og.gain.exponentialRampToValueAtTime(0.11, land + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, land + 0.22);
    o.connect(og).connect(this.master);
    o.start(land);
    o.stop(land + 0.3);
  }

  dispose() {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.hum = null;
    this.noise = null;
  }
}
