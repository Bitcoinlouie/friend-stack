/** Landing thuds synthesised with Web Audio; bigger pieces sound lower, higher towers sound brighter. */
export function createThud() {
  let context: AudioContext | null = null, muted = true, disposed = false;
  const ready = () => {
    if (disposed || muted) return null;
    if (!context) {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return null;
      context = new Audio();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  };
  return {
    setMuted(next: boolean) { muted = next; if (!next) ready(); },
    play(pixels: number, height: number) {
      const audio = ready();
      if (!audio) return;
      const now = audio.currentTime, size = Math.max(0.6, Math.min(1.6, Math.sqrt(pixels / 70)));
      const start = Math.min(420, (150 / size) * (1 + Math.min(height, 60) / 45));
      const tone = audio.createOscillator(), gain = audio.createGain();
      tone.type = "triangle";
      tone.frequency.setValueAtTime(start, now);
      tone.frequency.exponentialRampToValueAtTime(start * 0.42, now + 0.14);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      tone.connect(gain).connect(audio.destination);
      tone.start(now); tone.stop(now + 0.22);
    },
    dispose() { disposed = true; void context?.close(); context = null; },
  };
}
export type Thud = ReturnType<typeof createThud>;
