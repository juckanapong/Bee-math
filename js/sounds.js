/* BeeMath — เสียงประกอบ สังเคราะห์ด้วย Web Audio API (ไม่ใช้ไฟล์เสียง จึงไม่มีปัญหาลิขสิทธิ์และไม่ต้องโหลดเพิ่ม)
   เรียกใช้: SFX.play('correct') · เคารพการตั้งค่า S.settings.sound / S.settings.volume
   เสียงกด (tap) ใช้ไฟล์ audio/click.mp3 · ดังทุกครั้งที่กดปุ่ม/ลิงก์/สวิตช์ (ตัวฟังอยู่ท้ายไฟล์)
   เพลงประกอบ (Music): ไฟล์ audio/bgm.m4a วนซ้ำ · เปิด/ปิดที่ปุ่มโน้ตข้างหัวใจ หรือ ตั้งค่า › เพลงประกอบ (S.settings.music) */

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
  // เสียงกดจากไฟล์: ถอดรหัสล่วงหน้าด้วย OfflineAudioContext (ไม่ต้องรอผู้ใช้แตะ) แล้วเล่นทันทีเมื่อกด
  let clickBuf = null;
  (async () => {
    try {
      const O = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const data = await (await fetch('audio/click.mp3')).arrayBuffer();
      clickBuf = await new O(2, 1, 44100).decodeAudioData(data);
    } catch (e) { /* โหลดไม่ได้: ใช้เสียงสังเคราะห์แทน */ }
  })();
  function sample(buf, gain) {
    const c = audio();
    if (!c) return;
    const src = c.createBufferSource(), amp = c.createGain();
    src.buffer = buf;
    amp.gain.value = gain * S.settings.volume;
    src.connect(amp).connect(c.destination);
    src.start();
  }
  let lastTap = 0;
  const SOUNDS = {
    tap: () => (clickBuf ? sample(clickBuf, 0.9) : tone(620, 0, 0.05, 'triangle', 0.1)),
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
      // ปุ่มที่เล่นเสียงกดเองอยู่แล้ว + ตัวฟังกดทั้งแอป: ดังครั้งเดียว
      if (name === 'tap') { const now = performance.now(); if (now - lastTap < 90) return; lastTap = now; }
      try { SOUNDS[name]?.(); } catch (e) { /* อุปกรณ์ไม่รองรับเสียง */ }
    },
  };
})();

// ---------- เพลงประกอบ ----------
// เปิดแอปแล้วลองเล่นเองทันที (autoplay()) · ถ้าเบราว์เซอร์ไม่ยอม (iPhone/iPad ไม่ยอมเสมอ · Chrome ยอมเมื่อติดตั้งเป็นแอปหรือเข้าบ่อย)
// จะเริ่มที่การแตะ/กดปุ่มครั้งแรกแทน
// ความดังผ่าน GainNode (iPhone ไม่ยอมให้ตั้ง audio.volume) · เบาลงระหว่างทำโจทย์ · หยุดเมื่อสลับไปแอปอื่น
const Music = (() => {
  let el = null, ctx = null, gain = null, unlocked = false;
  const on = () => S.settings.music !== false;
  const level = () => 0.35 * (S.settings.volume ?? 0.8) * (typeof UI !== 'undefined' && ['lesson', 'timed', 'story'].includes(UI.view) ? 0.55 : 1);
  function ensure() {
    if (el) return;
    el = new Audio('audio/bgm.m4a');
    el.loop = true; el.preload = 'auto'; el.setAttribute('playsinline', '');
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      ctx = new C(); gain = ctx.createGain();
      ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
    } catch (e) { ctx = null; gain = null; }
  }
  function apply() {
    if (!el) return;
    if (gain) gain.gain.setTargetAtTime(level(), ctx.currentTime, 0.25); else el.volume = Math.min(1, level());
  }
  function sync() {
    if (!on() || document.hidden) { el?.pause(); return; }
    if (!unlocked) return;
    ensure(); apply();
    if (ctx?.state === 'suspended') ctx.resume();
    if (el.paused) el.play().catch(() => {});
  }
  const unlock = () => { unlocked = true; sync(); };
  // iPhone นับ touchend/click เป็นการแตะที่อนุญาตเสียง (pointerdown อาจไม่นับ) จึงฟังทุกแบบ
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { passive: true });
  // ลองเล่นเองตอนเปิดแอป: เล่นได้จริงก็ถือว่าปลดล็อกแล้ว · ไม่ได้ก็หยุดไว้รอการแตะ (resume ของ AudioContext อาจค้างจนกว่าจะแตะ จึงรอแค่ 400ms)
  async function autoplay() {
    if (!on() || document.hidden || unlocked) return;
    ensure(); apply();
    try {
      if (ctx) await Promise.race([ctx.resume(), new Promise((ok) => setTimeout(ok, 400))]);
      await el.play();
      if (ctx && ctx.state !== 'running') throw new Error('blocked');
      unlocked = true;
    } catch (e) { if (!unlocked) el.pause(); }
  }
  document.addEventListener('visibilitychange', sync);
  return { sync, apply, on, autoplay, playing: () => !!el && !el.paused };
})();

// ---------- เสียงกดทั้งแอป ----------
// แตะ/คลิกปุ่ม ลิงก์ สวิตช์ ช่องเลือก → เสียงกด (ตอนกดลง ให้รู้สึกตอบสนองทันที) · Enter/Space บนปุ่มที่โฟกัสอยู่ก็ดัง
const TAPPABLE = 'button, a[href], [data-act], [role="switch"], [role="tab"], select, input[type="checkbox"], input[type="radio"], summary';
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.(TAPPABLE);
  if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') SFX.play('tap');
}, { passive: true });
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('button, a[href], [role="switch"], [role="tab"]') && !e.target.disabled) SFX.play('tap');
});
