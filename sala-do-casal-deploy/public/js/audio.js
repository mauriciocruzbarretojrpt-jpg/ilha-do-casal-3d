// Sintetizador WebAudio procedural + Trilha ambiente aconchegante (sem arquivos MP3 externos!)

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this._musicTimer = null;
    this._chordStep = 0;
  }

  _ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock() {
    this._ensure();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && this.musicOn) this._stopLoop();
    else if (!this.muted && this.musicOn) this._startLoop();
    return this.muted;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn && !this.muted) this._startLoop();
    else this._stopLoop();
    return this.musicOn;
  }

  tone(freq, dur = 0.12, { type = 'sine', vol = 0.12, slide = 0, delay = 0 } = {}) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur = 0.08, { vol = 0.08, band = 1200, delay = 0 } = {}) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.45));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = band;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  play(effect, power = 1) {
    if (this.muted) return;
    switch (effect) {
      case 'click':
        // Timbre cristalino clássico de menu PS2 / JRPG!
        this.tone(784, 0.075, { type: 'sine', vol: 0.09 });
        this.tone(1174.66, 0.11, { type: 'triangle', vol: 0.07, delay: 0.028 });
        break;
      case 'selectChar':
        this.tone(587.33, 0.09, { type: 'sine', vol: 0.1 });
        this.tone(880, 0.12, { type: 'sine', vol: 0.1, delay: 0.045 });
        this.tone(1318.5, 0.18, { type: 'triangle', vol: 0.09, delay: 0.09 });
        break;
      case 'jump':
        this.tone(280, 0.16, { type: 'sine', vol: 0.11, slide: 260 });
        break;
      case 'step':
        this.noise(0.04, { vol: 0.025, band: 500 });
        break;
      case 'emote':
        this.tone(523, 0.09, { type: 'sine', vol: 0.09 });
        this.tone(784, 0.14, { type: 'sine', vol: 0.09, delay: 0.07 });
        break;
      case 'chat':
        this.tone(640, 0.07, { type: 'triangle', vol: 0.07, slide: 120 });
        break;
      case 'racket':
        this.noise(0.06, { vol: 0.11, band: 1600 });
        this.tone(320, 0.08, { type: 'triangle', vol: 0.12, slide: -90 });
        break;
      case 'smash':
        this.noise(0.11, { vol: 0.18, band: 1900 });
        this.tone(520, 0.16, { type: 'sawtooth', vol: 0.13, slide: -260 });
        break;
      case 'bounce':
        this.tone(190, 0.06, { type: 'sine', vol: 0.08, slide: -60 });
        break;
      case 'boost':
        this.tone(330, 0.28, { type: 'sawtooth', vol: 0.1, slide: 550 });
        break;
      case 'bump':
        this.noise(0.09, { vol: 0.12, band: 380 });
        this.tone(120, 0.1, { type: 'square', vol: 0.08, slide: -50 });
        break;
      case 'clack':
        this.tone(880 + Math.random() * 220, 0.045, { type: 'sine', vol: 0.12 * Math.min(1, power) });
        this.noise(0.025, { vol: 0.06 * Math.min(1, power), band: 2800 });
        break;
      case 'pocket':
        this.tone(340, 0.14, { type: 'triangle', vol: 0.12, slide: -140 });
        this.tone(520, 0.16, { type: 'sine', vol: 0.1, delay: 0.09 });
        break;
      case 'flip':
        this.tone(480, 0.08, { type: 'triangle', vol: 0.09, slide: 200 });
        break;
      case 'match':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.11, delay: i * 0.07 }));
        break;
      case 'drop':
        this.tone(420, 0.12, { type: 'sine', vol: 0.1, slide: -210 });
        this.tone(240, 0.07, { type: 'triangle', vol: 0.09, delay: 0.13 });
        break;
      case 'paint':
        this.noise(0.03, { vol: 0.02, band: 2100 });
        break;
      case 'countdown':
        this.tone(440, 0.11, { type: 'triangle', vol: 0.1 });
        break;
      case 'go':
        this.tone(880, 0.25, { type: 'triangle', vol: 0.14 });
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone(f, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.09 });
        });
        break;
      case 'lose':
        [392, 349.23, 311.13].forEach((f, i) => {
          this.tone(f, 0.2, { type: 'sine', vol: 0.09, delay: i * 0.12 });
        });
        break;
    }
  }

  _startLoop() {
    this._stopLoop();
    const chords = [
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
      [174.61, 220.0, 261.63, 349.23], // Fmaj7
      [196.0, 246.94, 293.66, 392.0],  // G6
    ];
    const playBar = () => {
      if (this.muted || !this.musicOn) return;
      const chord = chords[this._chordStep++ % chords.length];
      chord.forEach((f, idx) => {
        this.tone(f, 1.6, { type: 'sine', vol: 0.024, delay: idx * 0.14 });
      });
    };
    playBar();
    this._musicTimer = setInterval(playBar, 2400);
  }

  _stopLoop() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }
}

export const audio = new SoundEngine();

// Desbloqueio automático de WebAudio no primeiro toque em celulares (iOS Safari / Chrome Android)
if (typeof window !== 'undefined') {
  const autoUnlock = () => {
    audio.unlock();
    if (audio.ctx && audio.ctx.state === 'running') {
      window.removeEventListener('pointerdown', autoUnlock);
      window.removeEventListener('touchstart', autoUnlock);
      window.removeEventListener('keydown', autoUnlock);
    }
  };
  window.addEventListener('pointerdown', autoUnlock, { passive: true });
  window.addEventListener('touchstart', autoUnlock, { passive: true });
  window.addEventListener('keydown', autoUnlock, { passive: true });
}
