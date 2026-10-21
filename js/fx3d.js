/* BeeMath — ฉาก 3 มิติสำหรับช่วงฉลอง (three.js · โหลดเมื่อจะใช้เท่านั้น ผ่าน fx3dPreload() ใน js/app.js)
   ใช้ยังไง: ใส่ data-fx3d="win|league|chest" + data-fx-id บนองค์ประกอบในหน้า แล้ว render() เรียก sync() ทุกครั้ง
   ฉากเล่นครั้งเดียวต่อ data-fx-id · เล่นจบแล้วหยุดวาด (ค้างภาพสุดท้าย ไม่กินเครื่อง) · ตอบถูกใช้ burst() แบบชั่วคราว
   หน้าตา: แสงแบบการ์ตูน (MeshToonMaterial) + เส้นขอบเข้ม ให้เข้ากับน้องผึ้งและหกเหลี่ยม 2 มิติของแอป */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';

const INK = 0x2a1f14;
const PALETTE = [0xffc21a, 0x58c23a, 0x2f6fed, 0xff7a1a, 0xffe08a];

// ---------- renderer เดียว ย้ายไปมาระหว่างเวที ----------
let renderer = null, scene = null, camera = null, raf = 0, last = 0;
let active = null;          // { id, kind, host, stage, fixed, items, t, done, keep }
const played = new Set();   // data-fx-id ที่เล่นไปแล้ว
const toon = (() => {       // แสงเงา 3 ระดับแบบการ์ตูน
  const tex = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]), 3, 1);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return tex;
})();
const mat = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toon, ...extra });
const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

function init() {
  if (renderer) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { renderer = null; return false; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  camera.position.set(0, 0, 1000);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-0.6, 1, 1.2);
  scene.add(sun);
  return true;
}

// ---------- ชิ้นส่วน ----------
const geoCache = {};
function hexGeo(depth = 0.45, bevel = 0.08) {
  const k = depth + ':' + bevel;
  if (geoCache[k]) return geoCache[k];
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const p = [Math.cos(a), Math.sin(a)]; i ? s.lineTo(...p) : s.moveTo(...p); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  g.center();
  return (geoCache[k] = g);
}
// หกเหลี่ยม (ด้านแหลมขึ้นบน เหมือน clip-path ของแอป) พร้อมเส้นขอบ
function hexPrism(color, { outline = true, depth } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(hexGeo(depth), mat(color));
  g.add(m);
  if (outline) { const o = new THREE.Mesh(hexGeo(depth), outlineMat); o.scale.setScalar(1.08); g.add(o); }
  return g;
}
// ลายแถบของตัวผึ้ง (แถบตามแนวละติจูดของทรงกลม = วงรอบลำตัว)
function stripeTex() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#FFC21A'; x.fillRect(0, 0, 8, 256);
  x.fillStyle = '#2A1F14'; x.fillRect(0, 158, 8, 22); x.fillRect(0, 196, 8, 20);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// น้องผึ้ง 3 มิติ: หน้ากลมหันหาผู้เล่นเหมือนน้องผึ้ง 2 มิติ · รัศมีลำตัว = 1 หน่วย
function makeBee() {
  const bee = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat(0xffffff, { map: stripeTex() }));
  body.scale.set(1, 0.95, 0.92);
  bee.add(body);
  const hull = new THREE.Mesh(body.geometry, outlineMat); hull.scale.set(1.06, 1.01, 0.98); bee.add(hull);
  const eyeW = mat(0xffffff), eyeB = mat(INK);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), eyeW);
    eye.position.set(0.3 * sx, 0.12, 0.84); eye.scale.set(1, 1.15, 0.6); bee.add(eye);
    const eo = new THREE.Mesh(eye.geometry, outlineMat); eo.position.copy(eye.position); eo.scale.set(1.15, 1.3, 0.62); bee.add(eo);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), eyeB);
    pupil.position.set(0.32 * sx, 0.1, 0.96); bee.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeW);
    glint.position.set(0.35 * sx, 0.15, 1.04); bee.add(glint);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), mat(0xffa8a0));
    cheek.position.set(0.55 * sx, -0.12, 0.74); cheek.scale.set(1, 0.6, 0.4); bee.add(cheek);
    // หนวด
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.25 * sx, 0.8, 0.3), new THREE.Vector3(0.38 * sx, 1.15, 0.35), new THREE.Vector3(0.6 * sx, 1.35, 0.3)]);
    bee.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.045, 6), eyeB));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), eyeB); tip.position.set(0.6 * sx, 1.36, 0.3); bee.add(tip);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20, Math.PI), eyeB);
  smile.rotation.z = Math.PI; smile.position.set(0, -0.12, 0.93); bee.add(smile);
  // ปีก (หมุนรอบโคนปีกเพื่อกระพือ)
  bee.userData.wings = [-1, 1].map((sx) => {
    const pivot = new THREE.Group(); pivot.position.set(0.35 * sx, 0.6, -0.2);
    const wing = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), new THREE.MeshToonMaterial({ color: 0xdcebff, gradientMap: toon, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    wing.scale.set(0.7, 1.05, 1); wing.position.set(0.32 * sx, 0.42, 0); wing.rotation.z = -0.45 * sx;
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 28), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }));
    rim.scale.copy(wing.scale); rim.position.copy(wing.position); rim.rotation.copy(wing.rotation);
    pivot.add(wing, rim); bee.add(pivot);
    pivot.userData.sx = sx;
    return pivot;
  });
  return bee;
}
function flap(bee, t, speed = 38) {
  for (const w of bee.userData.wings) w.rotation.y = Math.sin(t * speed) * 0.7 * w.userData.sx;
}

// ---------- ค่าช่วย ----------
const ease = { out: (x) => 1 - Math.pow(1 - x, 3), back: (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2), inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2) };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rnd = (a, b) => a + Math.random() * (b - a);
// จุดบนหน้าจอ (พิกเซลในเวที) → พิกัดโลก (กล้องตั้งฉาก 1 หน่วย = 1 พิกเซล จุดศูนย์กลางเวที = 0,0)
function toWorld(stageRect, el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - stageRect.left - stageRect.width / 2, y: stageRect.top + stageRect.height / 2 - (r.top + r.height / 2), w: r.width, h: r.height };
}
// เศษหกเหลี่ยมพุ่งออกจากจุดหนึ่ง (มีแรงโน้มถ่วง หมุน แล้วจางหาย)
function burstItems(x, y, { n = 30, colors = PALETTE, speed = [260, 640], size = [7, 15], life = [1.1, 1.8], up = 260, delay = 0 } = {}) {
  return Array.from({ length: n }, () => {
    const m = hexPrism(colors[Math.floor(Math.random() * colors.length)], { outline: false, depth: 0.5 });
    const a = rnd(0, Math.PI * 2), v = rnd(...speed);
    m.scale.setScalar(rnd(...size)); m.position.set(x, y, rnd(-50, 50)); m.visible = false;
    m.children[0].material.transparent = true;
    return { obj: m, delay, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up, spin: [rnd(-9, 9), rnd(-9, 9), rnd(-6, 6)], life: rnd(...life), kind: 'bit' };
  });
}
function stepBits(items, t, dt) {
  let alive = false;
  for (const b of items) {
    if (b.kind !== 'bit') continue;
    const age = t - b.delay;
    if (age < 0) { alive = true; continue; }
    if (age > b.life) { b.obj.visible = false; continue; }
    alive = true;
    b.obj.visible = true;
    b.vy -= 1500 * dt; b.vx *= 1 - 0.6 * dt;
    b.obj.position.x += b.vx * dt; b.obj.position.y += b.vy * dt;
    b.obj.rotation.x += b.spin[0] * dt; b.obj.rotation.y += b.spin[1] * dt; b.obj.rotation.z += b.spin[2] * dt;
    b.obj.children[0].material.opacity = 1 - clamp01((age - b.life * 0.6) / (b.life * 0.4));
  }
  return alive;
}

// ---------- ฉาก ----------
// ชนะ: น้องผึ้งบินวนเข้ามาลงที่วงกลมกลางจอ แล้วเศษหกเหลี่ยมแตกออก · จบแล้วผึ้งลอยค้างไว้ (ภาพนิ่ง)
function sceneWin(sc, rect) {
  const hero = sc.host, p = toWorld(rect, hero);
  const bee = sc.bee = makeBee();
  const r = Math.min(p.w, p.h) * 0.37;
  bee.scale.setScalar(r);
  sc.items.push({ obj: bee, kind: 'bee' }, ...burstItems(p.x, p.y, { n: 34, delay: 1.15 }));
  const from = { x: -rect.width / 2 - r * 2, y: p.y + rect.height * 0.18 };
  sc.update = (t) => {
    const k = clamp01(t / 1.2), e = ease.inOut(k);
    // เส้นทางโค้ง + วนหนึ่งรอบก่อนถึงจุดหมาย
    const loop = Math.sin(k * Math.PI) * r * 1.6;
    bee.position.set(from.x + (p.x - from.x) * e + Math.sin(k * Math.PI * 2) * loop * 0.6, from.y + (p.y - from.y) * e + Math.cos(k * Math.PI * 2) * loop * 0.5 - loop * 0.5, 200);
    bee.rotation.z = k < 1 ? -0.35 * Math.cos(k * Math.PI * 2) : 0;
    bee.rotation.y = k < 1 ? 0.5 * (1 - e) : 0;
    // ลงจอดแบบเด้งเล็กน้อย แล้วลอยขึ้นลงอีกนิดก่อนหยุด
    if (t > 1.2) {
      const s = t - 1.2, bounce = Math.exp(-4 * s) * Math.sin(s * 14);
      bee.scale.set(r * (1 + bounce * 0.12), r * (1 - bounce * 0.12), r);
      bee.position.y = p.y + Math.sin(s * 5) * r * 0.08 * Math.max(0, 1 - s / 2.2);
      // หันเฉียงเล็กน้อยตอนหยุด ให้เห็นความเป็น 3 มิติ
      const turn = ease.out(clamp01(s / 0.9));
      bee.rotation.y = -0.32 * turn; bee.rotation.x = 0.1 * turn;
    }
    flap(bee, t, t < 3.2 ? 38 : 0);
    if (t >= 3.4) { for (const w of bee.userData.wings) w.rotation.y = 0.2 * w.userData.sx; return false; }
    return true;
  };
}
// เลื่อนลีก/ผลลีก: หกเหลี่ยมสีลีกหมุนเข้ามาแทนพื้นหลังไอคอน + เศษหกเหลี่ยม
function sceneLeague(sc, rect) {
  const p = toWorld(rect, sc.host), color = new THREE.Color(sc.host.dataset.color || '#FFC21A').getHex(), up = sc.host.dataset.up === '1';
  const hx = hexPrism(color, { depth: 0.38 });
  hx.position.set(p.x, p.y, 0);
  hx.rotation.z = 0; // ด้านแหลมขึ้นบนอยู่แล้ว (มุมเริ่ม 30°)
  const size = Math.min(p.w, p.h) / 2 * 0.98;
  sc.items.push({ obj: hx, kind: 'hex' }, ...(up ? burstItems(p.x, p.y, { n: 30, colors: [color, 0xffc21a, 0xffe08a], delay: 0.95, up: 60, speed: [220, 520] }) : []));
  sc.update = (t) => {
    const k = clamp01(t / 1.15);
    hx.scale.setScalar(size * Math.max(0.001, ease.back(k)));
    hx.rotation.y = (1 - ease.out(k)) * Math.PI * (up ? 4 : 2);
    hx.rotation.x = (1 - ease.out(k)) * 0.6;
    return t < (up ? 2.8 : 1.3);
  };
}
// เปิดหีบ: เหรียญหกเหลี่ยมสีน้ำผึ้งพุ่งขึ้นจากหีบเป็นน้ำพุ
function sceneChest(sc, rect) {
  const p = toWorld(rect, sc.host);
  const coins = burstItems(p.x, p.y + p.h * 0.1, { n: 22, colors: [0xffc21a, 0xffd24d, 0xe09a00], speed: [120, 340], up: 560, size: [10, 17], life: [1.4, 2.1] });
  sc.items.push(...coins, ...burstItems(p.x, p.y, { n: 16, delay: 0.1, size: [5, 9] }));
  sc.update = (t) => t < 0.3; // เศษทั้งหมดขยับใน frame() เอง
}
// ตอบถูก: เศษหกเหลี่ยมเล็ก ๆ แตกจากไอคอนถูก (เวทีชั่วคราว ลบทิ้งเมื่อจบ)
function sceneCorrect(sc, rect) {
  const p = toWorld(rect, sc.host);
  sc.items.push(...burstItems(p.x, p.y, { n: 16, colors: [0x58c23a, 0xffc21a, 0x8ee06a], speed: [200, 460], size: [5, 9], life: [0.75, 1.15], up: 340 }));
  sc.update = (t) => t < 0.2;
}
const SCENES = { win: sceneWin, league: sceneLeague, chest: sceneChest, correct: sceneCorrect };
// ฉากชั่วคราวบนเวทีลอยเต็มจอ (ไม่ค้างภาพ · ไม่ถูกกรอบหน้าต่างตัด) · ฉากอื่นอยู่ในหน้า/การ์ด และค้างภาพสุดท้าย
const FLOATING = new Set(['correct', 'chest']);

// ---------- เวที ----------
// win: เต็มส่วนบนของหน้าผลลัพธ์ · league/chest: เต็มการ์ดในหน้าต่าง · correct: เต็มจอแบบลอย (ชั่วคราว)
function stageFor(kind, host) {
  if (FLOATING.has(kind)) { const s = document.createElement('div'); s.className = 'fx-stage fixed'; document.body.appendChild(s); return s; }
  const box = kind === 'win' ? host.closest('.result') : host.closest('.sheet-card');
  if (!box) return null;
  let s = box.querySelector(':scope > .fx-stage');
  if (!s) { s = document.createElement('div'); s.className = 'fx-stage ' + kind; box.prepend(s); }
  return s;
}
function fit(stage) {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return r;
  renderer.setSize(r.width, r.height, false);
  Object.assign(renderer.domElement.style, { width: r.width + 'px', height: r.height + 'px' });
  camera.left = -r.width / 2; camera.right = r.width / 2; camera.top = r.height / 2; camera.bottom = -r.height / 2;
  camera.updateProjectionMatrix();
  return r;
}
function stop(dispose = true) {
  cancelAnimationFrame(raf); raf = 0;
  if (!active) return;
  for (const it of active.items) scene.remove(it.obj);
  if (dispose) active.items.forEach((it) => it.obj.traverse((o) => { if (o.material && o.material !== outlineMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.geometry && !Object.values(geoCache).includes(o.geometry)) o.geometry.dispose(); }));
  active.host?.classList.remove('fx-on');
  if (FLOATING.has(active.kind)) active.stage.remove();
  else renderer.domElement.remove();
  active = null;
}
function start(kind, host, id) {
  if (!init()) return;
  stop();
  const stage = stageFor(kind, host);
  if (!stage) return;
  stage.appendChild(renderer.domElement);
  const rect = fit(stage);
  const sc = { id, kind, host, stage, items: [], t: 0 };
  SCENES[kind](sc, rect);
  for (const it of sc.items) scene.add(it.obj);
  active = sc;
  host.classList.add('fx-on');
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function frame(now) {
  if (!active) return;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now); // เวลาเฟรมแรกอาจมาก่อนเวลาเริ่ม
  active.t += dt;
  const bits = stepBits(active.items, active.t, dt);
  const more = active.update(active.t, dt);
  renderer.render(scene, camera);
  if (more || bits) raf = requestAnimationFrame(frame);
  else if (FLOATING.has(active.kind)) stop();
  else { raf = 0; active.done = true; } // ค้างภาพสุดท้ายไว้ ไม่วาดต่อ
}

// ---------- เรียกจากแอป ----------
// หลัง render() ทุกครั้ง: ย้ายแคนวาสกลับเข้าเวทีใหม่ (innerHTML ถูกแทนที่) · เริ่มฉากใหม่ที่ยังไม่เคยเล่น · หยุดฉากที่องค์ประกอบหายไปแล้ว
export function sync() {
  if (active && !FLOATING.has(active.kind)) {
    const host = document.querySelector(`[data-fx-id="${active.id}"]`);
    if (!host) stop();
    else if (host !== active.host) {
      active.host = host; host.classList.add('fx-on');
      const stage = stageFor(active.kind, host);
      if (stage) { active.stage = stage; stage.appendChild(renderer.domElement); fit(stage); renderer.render(scene, camera); }
      else stop();
    }
  }
  for (const host of document.querySelectorAll('[data-fx3d][data-fx-id]')) {
    const id = host.dataset.fxId;
    if (played.has(id)) continue;
    played.add(id);
    start(host.dataset.fx3d, host, id);
  }
}
export function burst(el) {
  if (!el || (active && active.kind !== 'correct' && !active.done)) return; // ไม่แย่งฉากใหญ่ที่กำลังเล่น
  if (active && active.kind !== 'correct') stop();
  start('correct', el, 'correct-' + Date.now());
}
export function reset() { stop(); }
addEventListener('resize', () => {
  if (!active || !renderer) return;
  fit(active.stage);
  renderer.render(scene, camera);
});
