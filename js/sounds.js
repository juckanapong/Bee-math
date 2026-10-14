/* BeeMath — เสียงประกอบ สังเคราะห์ด้วย Web Audio API (ไม่ใช้ไฟล์เสียง จึงไม่มีปัญหาลิขสิทธิ์และไม่ต้องโหลดเพิ่ม)
   เรียกใช้: SFX.play('correct') · เคารพการตั้งค่า S.settings.sound / S.settings.volume */

const SFX = (() => {
  let ctx = null;
  // เบราว์เซอร์อนุญาตให้เล่นเสียงหลังผู้ใช้แตะหน้าจอแล้วเท่านั้น จึงสร้าง AudioContext ตอนเล่นครั้งแรก
  function audio() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // โน้ตหนึ่งตัว: ความถี่ เวลาเริ่ม (วินาที) ความยาว รูปคลื่น ความดัง และความถี่ปลายทาง (ถ้าต้องการให้เสียงไหล)
  function tone(freq, start, dur, type = 'sine', gain = 0.25, slideTo = null) {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator(), amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const v = Math.max(0.0002, gain * S.settings.volume);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(v, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  const SOUNDS = {
    tap: () => tone(620, 0, 0.05, 'triangle', 0.1),
    correct: () => { tone(784, 0, 0.12, 'triangle', 0.3); tone(1175, 0.09, 0.24, 'triangle', 0.3); },
    wrong: () => { tone(233, 0, 0.16, 'square', 0.1, 196); tone(196, 0.13, 0.26, 'square', 0.09, 147); },
    complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, i === 3 ? 0.5 : 0.25, 'triangle', 0.26)),
    fail: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.32, 'triangle', 0.2)),
    reward: () => { tone(1319, 0, 0.1, 'sine', 0.22); tone(1760, 0.08, 0.3, 'sine', 0.22); },
    levelup: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.09, 0.35, 'sine', 0.2)),
    tick: () => tone(1046, 0, 0.04, 'square', 0.05),
  };
  return {
    play(name) {
      if (!S.settings.sound || S.settings.volume <= 0) return;
      try { SOUNDS[name]?.(); } catch (e) { /* อุปกรณ์ไม่รองรับเสียง */ }
    },
  };
})();
