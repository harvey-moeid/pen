/** Original procedural sounds. Created only after a deliberate user gesture. */
export class StadiumAudio {
  readonly context = new AudioContext();
  muted = true;
  volume = 0.35;
  private tone(frequency: number, end: number, duration: number, delay = 0) {
    const ctx = this.context,
      o = ctx.createOscillator(),
      gain = ctx.createGain(),
      t = ctx.currentTime + delay;
    o.type = 'sine';
    o.frequency.setValueAtTime(frequency, t);
    o.frequency.exponentialRampToValueAtTime(end, t + duration);
    gain.gain.setValueAtTime(Math.max(0.001, this.volume * 0.2), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(gain);
    gain.connect(ctx.destination);
    o.start(t);
    o.stop(t + duration);
  }
  private noise(duration: number, volume: number, frequency: number) {
    const ctx = this.context,
      buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate),
      values = buffer.getChannelData(0);
    for (let i = 0; i < values.length; i++)
      values[i] = (Math.random() * 2 - 1) * (1 - i / values.length);
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.value = this.volume * volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }
  cue(event: string) {
    if (this.muted || this.context.state !== 'running') return;
    if (event === 'KICK') {
      this.noise(0.14, 0.45, 700);
      this.tone(120, 40, 0.18);
    }
    if (event === 'WHISTLE') this.tone(1800, 2100, 0.2);
    if (event === 'GOAL') {
      this.noise(1.4, 0.12, 2600);
      [440, 554, 659, 880].forEach((f, i) => this.tone(f, f * 1.02, 0.35, i * 0.1));
    }
    if (event === 'SAVE') {
      this.noise(0.3, 0.3, 900);
      this.tone(190, 80, 0.25);
    }
    if (event === 'MISS') this.tone(330, 100, 0.5);
  }
  async enable() {
    this.muted = false;
    await this.context.resume();
  }
  async dispose() {
    await this.context.close();
  }
}
