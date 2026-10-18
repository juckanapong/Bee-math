// BeeMath · ตรวจรอบเรียนที่แอปส่งมา แล้วคิด XP ด้วยกติกาเดียวกับแอป (finish() ใน js/app.js, finishTimed()/nextStory() ใน js/extras.js)
// เป็น JavaScript ล้วน ไม่ใช้ API ของ Deno/เบราว์เซอร์ จึงทดสอบด้วย Node ได้ (tools/test-sessions.mjs)
//
// C = เนื้อหาจาก js/data.js (_shared/content.mjs ที่สร้างด้วย tools/build-shared.mjs)
// verifySession(C, { kind, seed, meta, completed, answers }) → { xp, stats: { solved, bar, perfect }, minMs, summary }
// ถ้าข้อมูลไม่สอดคล้องกับโจทย์ที่สร้างจาก seed จะโยน Rejected (แอปจะไม่ส่งซ้ำ)

export class Rejected extends Error {}
const fail = (msg) => { throw new Rejected(msg); };
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// จำนวนข้อของรอบ (startSession() ใน js/app.js)
const SIZE = { lesson: 6, test: 8, practice: 8, legend: 10, jump: 10, placement: 10 };
// XP เมื่อผ่าน (practice คิดจากจำนวนข้อที่ถูก)
const BASE_XP = { test: 20, lesson: 10, legend: 30, jump: 20 };
// เวลาขั้นต่ำที่ใช้ต่อข้อ (มิลลิวินาที) · กันการส่งคำตอบอัตโนมัติรัว ๆ
const MIN_MS_PER_ANSWER = 1200;
const MIN_MS_PER_STORY_STEP = 2000;
// เกมผึ้งเร่งรีบ (startTimed()/answerTimed() ใน js/extras.js)
const TIMED_START_MS = 60000, TIMED_RIGHT_MS = 2000, TIMED_WRONG_MS = 5000;
const TIMED_GRACE_MS = 300; // ตัวจับเวลาในแอปตรวจทุก 200 มิลลิวินาที คำตอบจึงมาช้ากว่าเวลาหมดได้เล็กน้อย
const TIMED_MIN_GAP_MS = 200;

export function verifySession(C, s) {
  if (s.kind === 'timed') return verifyTimed(C, s);
  if (s.kind === 'story') return verifyStory(C, s);
  if (!SIZE[s.kind]) fail('unknown kind');
  return verifyQueue(C, s);
}

// ---------- บทเรียน · ด่านทดสอบ · ฝึกฝน · ระดับตำนาน · ข้ามบท · วัดระดับ ----------
const unitGens = (C, u) => C.uniq(u.lessons.flatMap((l) => l.gens));

// ตัวสร้างโจทย์ที่รอบนี้ใช้ได้ · expected = รายการตัวสร้างของทุกข้อ (ถ้ารู้แน่นอน) ใช้ตรวจว่าครบชุดจริง
function plan(C, kind, meta, n) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const cycle = (gens) => Array.from({ length: n }, (_, i) => gens[i % gens.length]);
  if (kind === 'lesson' || kind === 'test') {
    const node = C.NODES[m.i];
    if (!isInt(m.i, 0, C.NODES.length - 1) || node.kind !== kind) fail('bad node');
    return { allowed: new Set(node.gens), expected: cycle(node.gens) };
  }
  if (kind === 'legend') {
    const u = C.UNITS.find((x) => x.id === m.unit);
    if (!u) fail('bad unit');
    const gens = unitGens(C, u);
    return { allowed: new Set(gens), expected: cycle(gens) };
  }
  if (kind === 'jump') {
    // บทแรกที่ยังไม่ผ่านขึ้นกับความคืบหน้าในเครื่อง → ตรวจแค่ว่ามาจากบทก่อนบทเป้าหมาย
    if (!isInt(m.unit, 1, C.UNITS.length - 1)) fail('bad unit');
    return { allowed: new Set(C.UNITS.slice(0, m.unit).flatMap((u) => unitGens(C, u))), expected: null };
  }
  if (kind === 'placement') {
    // startPlacement(): 5 ข้อจากบทที่ 1 แล้ว 5 ข้อจากบทที่ 2 เรียงตามลำดับ
    const units = m.units;
    if (!Array.isArray(units) || units.length !== n || !units.every((u, i) => u === (i < 5 ? 0 : 1))) fail('bad placement');
    return { allowed: null, perSlot: units.map((u) => new Set(unitGens(C, C.UNITS[u]))), expected: null };
  }
  // practice: ตัวสร้างมาจากจุดอ่อน/ข้อที่ผิด/หัวข้อ ซึ่งขึ้นกับข้อมูลในเครื่อง → ใช้ได้ทุกตัวสร้าง
  return { allowed: new Set(Object.keys(C.G)), expected: null };
}

// ตรวจคำตอบ 1 ข้อเทียบกับโจทย์ที่สร้างใหม่จาก seed (กติกาเดียวกับ check() ใน js/app.js)
function grade(q, a) {
  switch (q.type) {
    case 'choice':
      if (!isInt(a, 0, q.choices.length - 1)) fail('bad choice');
      return a === q.answer;
    case 'input':
      if (typeof a !== 'number' || !Number.isFinite(a)) fail('bad input');
      return a === q.answer;
    case 'barbuild': {
      if (!Array.isArray(a) || a.length > 20 || !a.every((t) => typeof t === 'string')) fail('bad bar');
      const nums = a.filter((t) => t !== 'x');
      return a.length - nums.length === q.a && nums.length === 1 && Number(nums[0]) === q.b;
    }
    case 'order':
      if (!Array.isArray(a) || a.length > q.palette.length || !a.every((k) => isInt(k, 0, q.palette.length - 1))) fail('bad order');
      return a.length === q.steps.length && a.every((k, i) => q.palette[k] === q.steps[i]);
    case 'match': {
      // a = ทุกครั้งที่จับคู่ [ซ้าย, ขวา] · ต้องจับคู่ครบ · พลาดได้ 1 ครั้ง
      const n = q.pairs.length;
      if (!Array.isArray(a) || a.length > n * 4) fail('bad match');
      const done = new Set();
      let miss = 0;
      for (const t of a) {
        if (!Array.isArray(t) || t.length !== 2 || !isInt(t[0], 0, n - 1) || !isInt(t[1], 0, n - 1)) fail('bad match');
        if (done.has(t[0]) || done.has(t[1])) fail('bad match'); // ปุ่มของคู่ที่จับแล้วกดไม่ได้
        if (t[0] === t[1]) done.add(t[0]); else miss++;
      }
      if (done.size !== n) fail('match unfinished');
      return miss < 2;
    }
    default:
      fail('unknown question type');
  }
}

function verifyQueue(C, s) {
  const { kind, seed } = s;
  const n = SIZE[kind];
  const answers = s.answers;
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > n * 2) fail('bad answers');
  const p = plan(C, kind, s.meta, n);
  const retries = kind === 'lesson' || kind === 'practice'; // ข้อที่ผิดถูกถามซ้ำท้ายรอบ
  const base = new Map(); // uid → { g, l }
  const failed = []; // uid ของข้อหลักที่ผิด ตามลำดับ (= ลำดับข้อทวน)
  let retryAt = 0;
  let firstTry = 0, mistakes = 0, hard = 0, solved = 0, bar = 0;

  answers.forEach((x, i) => {
    if (!x || typeof x !== 'object' || !isInt(x.u, 0, n - 1) || !isInt(x.l, 0, 2) || typeof x.g !== 'string') fail('bad answer');
    if (i < n) {
      // ข้อหลัก: uid = ตำแหน่งในรอบ (startSession() กำหนด uid หลังสลับลำดับ) ตอบตามลำดับ
      if (x.r || x.u !== i) fail('bad order of answers');
      if (!Object.hasOwn(C.G, x.g)) fail('unknown generator');
      if (p.allowed && !p.allowed.has(x.g)) fail('generator not in session');
      if (p.perSlot && !p.perSlot[i].has(x.g)) fail('generator not in unit');
      if (kind === 'placement' && x.l !== 1) fail('placement level');
      base.set(x.u, { g: x.g, l: x.l });
    } else {
      // ข้อทวน: ต้องเป็นข้อหลักที่ผิด ตามลำดับที่ผิด ข้อละครั้ง และใช้โจทย์เดิม
      if (!retries || !x.r || failed[retryAt] !== x.u) fail('bad retry');
      retryAt++;
      const b = base.get(x.u);
      if (b.g !== x.g || b.l !== x.l) fail('retry changed');
    }
    const q = C.makeQuestion(x.g, x.l, C.subSeed(seed, x.u));
    const ok = grade(q, x.a);
    if (q.tags.includes('bar')) bar++;
    if (ok) {
      if (q.tags.includes('solve')) solved++;
      if (i < n) firstTry++;
      if (i < n && x.l === 2 && kind !== 'placement') hard++;
    } else {
      mistakes++;
      if (i < n) failed.push(x.u);
    }
  });

  // ตัวสร้างของข้อหลักต้องเป็นชุดเดียวกับที่รอบนี้สร้าง (ไม่สนลำดับเพราะแอปสลับแล้ว)
  if (p.expected && answers.length >= n) {
    const got = answers.slice(0, n).map((x) => x.g).sort();
    const want = [...p.expected].sort();
    if (got.some((g, i) => g !== want[i])) fail('generators do not match session');
  }

  // รอบที่จบจริง = ตอบครบทุกข้อหลักและทุกข้อทวน (ถ้าแอปบอกว่าจบแต่ไม่ครบ ถือว่าไม่จบ)
  const completed = s.completed === true && answers.length === n + (retries ? failed.length : 0);
  const twoStrikes = kind === 'legend' || kind === 'jump';
  const acc = Math.round((firstTry / n) * 100);
  const perfect = completed && mistakes === 0;
  const passed = completed && (kind !== 'test' || acc >= 70) && (!twoStrikes || mistakes <= 2);
  let xp = 0;
  if (kind === 'placement') xp = completed ? 10 : 0;
  else if (passed) {
    xp = BASE_XP[kind] ?? 5 + Math.floor(firstTry / 2);
    if (perfect && (kind === 'lesson' || kind === 'test')) xp += 5;
    xp += Math.min(5, hard); // โบนัสโจทย์ท้าทาย ข้อละ 1 XP
  }
  return {
    xp,
    stats: { solved, bar, perfect: passed && perfect && (kind === 'lesson' || kind === 'test') ? 1 : 0 },
    minMs: answers.length * MIN_MS_PER_ANSWER,
    summary: { kind, n, answered: answers.length, completed, passed, firstTry, mistakes, acc, hard: Math.min(5, hard) },
  };
}

// ---------- เกมผึ้งเร่งรีบ ----------
// answers = [{ g, l, k, t }] · t = เวลาที่ตอบนับจากเริ่มเกม · เวลาเริ่ม 60 วินาที ถูก +2 ผิด −5
function verifyTimed(C, s) {
  const answers = s.answers;
  if (!Array.isArray(answers) || answers.length === 0 || answers.length > 1000) fail('bad answers'); // ตอบเร็วกว่า 2 วินาทีต่อข้อ เกมจะไม่หมดเวลา
  let end = TIMED_START_MS, prev = -Infinity, score = 0, over = false;
  answers.forEach((x, i) => {
    if (over) fail('answer after time up');
    if (!x || typeof x !== 'object' || !isInt(x.l, 0, 2) || !isInt(x.k, 0, 3) || !isInt(x.t, 0, 3600000)) fail('bad answer');
    if (x.t < prev + TIMED_MIN_GAP_MS) fail('answers too fast');
    if (x.t > end + TIMED_GRACE_MS) fail('answer after time up');
    prev = x.t;
    const q = C.makeTimedQuestion(C.subSeed(s.seed, i), () => x.l);
    if (q.g !== x.g) fail('question mismatch');
    const ok = q.choices[x.k] === q.answer;
    if (ok) score++;
    end += ok ? TIMED_RIGHT_MS : -TIMED_WRONG_MS;
    if (end <= x.t) over = true;
  });
  return {
    xp: s.completed === true ? score : 0,
    stats: { solved: score, bar: 0, perfect: 0 },
    minMs: prev - 5000,
    summary: { kind: 'timed', answered: answers.length, score },
  };
}

// ---------- เรื่องเล่าโจทย์ ----------
// answers = [{ s, a }] ของทุกขั้นที่เป็นคำถาม ตามลำดับ · จบเรื่องได้ 15 XP (ไม่ขึ้นกับจำนวนข้อที่ถูก เหมือนในแอป)
function verifyStory(C, s) {
  const story = C.STORIES.find((x) => x.id === s.meta?.story);
  if (!story) fail('unknown story');
  const qs = story.steps.map((st, i) => (st.q ? i : -1)).filter((i) => i >= 0);
  const answers = s.answers;
  if (!Array.isArray(answers) || answers.length !== qs.length) fail('bad answers');
  let correct = 0;
  answers.forEach((x, i) => {
    if (!x || x.s !== qs[i]) fail('bad answer');
    const st = story.steps[x.s];
    if (st.q === 'choice' ? !isInt(x.a, 0, st.choices.length - 1) : typeof x.a !== 'number' || !Number.isFinite(x.a)) fail('bad answer');
    if (x.a === st.answer) correct++;
  });
  return {
    xp: s.completed === true ? 15 : 0,
    stats: { solved: 0, bar: 0, perfect: 0 },
    minMs: story.steps.length * MIN_MS_PER_STORY_STEP,
    summary: { kind: 'story', story: story.id, correct, total: qs.length },
  };
}

// ภารกิจประจำวัน → คอลัมน์สถิติใน xp_daily (supabase/sessions.sql)
export const QUEST_METRIC = { solve: 'solved', bar: 'bar', xp: 'xp', perfect: 'perfect' };
