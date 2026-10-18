// ทดสอบตัวตรวจรอบเรียนของเซิร์ฟเวอร์ (supabase/functions/_shared/verify.mjs)
// รัน: node tools/test-sessions.mjs   (ต้องรัน node tools/build-shared.mjs หลังแก้ js/data.js ก่อน)
import assert from 'node:assert/strict';
import * as C from '../supabase/functions/_shared/content.mjs';
import { Rejected, verifySession } from '../supabase/functions/_shared/verify.mjs';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}\n  ${e.stack}`); process.exitCode = 1; }
};
const rejects = (fn, msg) => assert.throws(fn, (e) => e instanceof Rejected && (!msg || e.message === msg));

// คำตอบที่ถูก / ผิด ของโจทย์แต่ละแบบ (รูปแบบเดียวกับ L.log ใน js/app.js)
function rightAnswer(q) {
  switch (q.type) {
    case 'choice': case 'input': return q.answer;
    case 'barbuild': return [...Array(q.a).fill('x'), String(q.b)];
    case 'order': return q.steps.map((s) => q.palette.indexOf(s));
    case 'match': return q.pairs.map((p) => [p.id, p.id]);
    case 'build': return q.key;
    case 'numline': return q.est ? Math.round((q.answer + 0.2) * 10) / 10 : q.answer;
    case 'multi': return q.answers;
  }
  throw new Error('type ' + q.type);
}
function wrongAnswer(q) {
  switch (q.type) {
    case 'choice': return (q.answer + 1) % q.choices.length;
    case 'input': return q.answer + 1;
    case 'barbuild': return [...Array(q.a + 1).fill('x'), String(q.b)];
    case 'order': return rightAnswer(q).reverse();
    case 'match': return [[0, 1], [1, 0], ...q.pairs.map((p) => [p.id, p.id])]; // พลาด 2 ครั้ง
    case 'build': return q.key.map((k) => (q.tiles[k] === '+' ? q.tiles.indexOf('-') : k)); // ax − b = c
    case 'numline': return q.est ? Math.round((q.answer + 0.5) * 10) / 10 : q.answer + 1;
    case 'multi': return q.answers.slice(1); // ขาดไป 1 ข้อ
  }
  throw new Error('type ' + q.type);
}
const uniq = (a) => [...new Set(a)];
// เล่นรอบแบบเดียวกับแอป: ข้อหลักตามลำดับ uid แล้วทวนข้อที่ผิดท้ายรอบ (lesson/practice)
// wrong = Set ของตำแหน่งข้อหลักที่ตอบผิด · lvl = ระดับความยากของทุกข้อ
function play({ kind, gens, n, seed = 12345, wrong = new Set(), lvl = 1, retryWrong = false, ordered = false }) {
  const base = Array.from({ length: n }, (_, i) => gens[i % gens.length]);
  const order = ordered ? base : [...base].reverse(); // ลำดับใดก็ได้ ขอแค่ uid = ตำแหน่ง
  const log = [], failed = [];
  order.forEach((g, uid) => {
    const q = C.makeQuestion(g, lvl, C.subSeed(seed, uid));
    const bad = wrong.has(uid);
    log.push({ u: uid, g, l: lvl, r: 0, a: bad ? wrongAnswer(q) : rightAnswer(q) });
    if (bad) failed.push({ uid, g, q });
  });
  if (kind === 'lesson' || kind === 'practice') {
    for (const f of failed) log.push({ u: f.uid, g: f.g, l: lvl, r: 1, a: retryWrong ? wrongAnswer(f.q) : rightAnswer(f.q) });
  }
  return { kind, seed, completed: true, answers: log };
}
const lessonNode = C.NODES.findIndex((x) => x.kind === 'lesson');
const testNode = C.NODES.findIndex((x) => x.kind === 'test');

// ---------- ตัวตรวจคำตอบต้องตรงกับโจทย์ทุกแบบ ----------
test('ทุกตัวสร้าง ทุกระดับ: คำตอบที่ถูกผ่าน คำตอบที่ผิดไม่ผ่าน', () => {
  for (const g of Object.keys(C.G)) {
    for (let lvl = 0; lvl < 3; lvl++) {
      for (let s = 0; s < 60; s++) {
        const seed = (s * 2654435761) >>> 0;
        const q = C.makeQuestion(g, lvl, C.subSeed(seed, 0));
        const one = (a) => verifySession(C, { kind: 'practice', seed, completed: false, answers: [{ u: 0, g, l: lvl, r: 0, a }] });
        assert.equal(one(rightAnswer(q)).summary.firstTry, 1, `${g} lvl ${lvl} seed ${seed} right`);
        assert.equal(one(wrongAnswer(q)).summary.firstTry, 0, `${g} lvl ${lvl} seed ${seed} wrong`);
      }
    }
  }
});
test('seed เดียวกันได้โจทย์เดียวกัน · seed ต่างกันได้โจทย์ต่างกัน', () => {
  const a = C.makeQuestion('twoStep', 1, 99), b = C.makeQuestion('twoStep', 1, 99);
  assert.deepEqual(a, b);
  const many = new Set(Array.from({ length: 40 }, (_, i) => C.makeQuestion('twoStep', 1, i).eq));
  assert.ok(many.size > 20);
});
test('makeQuestion ไม่ทำให้ตัวสุ่มปกติกลายเป็นแบบ seed', () => {
  C.makeQuestion('addEq', 2, 1);
  const xs = new Set(Array.from({ length: 30 }, () => C.G.addEq().eq));
  assert.ok(xs.size > 5);
});

// ---------- XP ตามกติกาในแอป ----------
test('บทเรียนไม่ผิดเลย = 10 + 5', () => {
  const r = verifySession(C, { ...play({ kind: 'lesson', gens: C.NODES[lessonNode].gens, n: 6 }), meta: { i: lessonNode } });
  assert.equal(r.xp, 15);
  assert.equal(r.stats.perfect, 1);
});
test('บทเรียนผิด 2 ข้อแล้วทวนถูก = 10 · ไม่นับไร้ที่ติ', () => {
  const r = verifySession(C, { ...play({ kind: 'lesson', gens: C.NODES[lessonNode].gens, n: 6, wrong: new Set([1, 4]) }), meta: { i: lessonNode } });
  assert.equal(r.xp, 10);
  assert.equal(r.stats.perfect, 0);
  assert.equal(r.summary.mistakes, 2);
});
test('บทเรียนระดับท้าทายทุกข้อ: โบนัสสูงสุด 5', () => {
  const r = verifySession(C, { ...play({ kind: 'lesson', gens: C.NODES[lessonNode].gens, n: 6, lvl: 2 }), meta: { i: lessonNode } });
  assert.equal(r.xp, 10 + 5 + 5);
});
test('ด่านทดสอบ: ถูกครั้งแรก ≥ 70% ผ่าน (20 + 5 ถ้าไม่ผิด) · ต่ำกว่านั้นได้ 0', () => {
  const gens = C.NODES[testNode].gens;
  assert.equal(verifySession(C, { ...play({ kind: 'test', gens, n: 8 }), meta: { i: testNode } }).xp, 25);
  assert.equal(verifySession(C, { ...play({ kind: 'test', gens, n: 8, wrong: new Set([0, 1]) }), meta: { i: testNode } }).xp, 20); // 75%
  assert.equal(verifySession(C, { ...play({ kind: 'test', gens, n: 8, wrong: new Set([0, 1, 2]) }), meta: { i: testNode } }).xp, 0); // 63%
});
test('ฝึกฝน = 5 + ครึ่งหนึ่งของข้อที่ถูกครั้งแรก', () => {
  const r = verifySession(C, { ...play({ kind: 'practice', gens: ['addEq', 'barBuild', 'matchSolve'], n: 8, wrong: new Set([2]) }), meta: {} });
  assert.equal(r.xp, 5 + Math.floor(7 / 2));
});
test('ระดับตำนาน: ผิดไม่เกิน 2 ได้ 30 · ผิด 3 ได้ 0', () => {
  const u = C.UNITS[0], gens = uniq(u.lessons.flatMap((l) => l.gens));
  assert.equal(verifySession(C, { ...play({ kind: 'legend', gens, n: 10, wrong: new Set([0, 5]) }), meta: { unit: u.id } }).xp, 30);
  assert.equal(verifySession(C, { ...play({ kind: 'legend', gens, n: 10, wrong: new Set([0, 5, 7]) }), meta: { unit: u.id } }).xp, 0);
});
test('ทดสอบข้ามบท: โจทย์จากบทก่อนหน้า ได้ 20', () => {
  const gens = uniq(C.UNITS.slice(0, 2).flatMap((u) => u.lessons.flatMap((l) => l.gens)));
  assert.equal(verifySession(C, { ...play({ kind: 'jump', gens, n: 10 }), meta: { unit: 2 } }).xp, 20);
});
test('ทดสอบวัดระดับ: 10 XP แม้ตอบผิด', () => {
  const g0 = uniq(C.UNITS[0].lessons.flatMap((l) => l.gens)), g1 = uniq(C.UNITS[1].lessons.flatMap((l) => l.gens));
  const gens = [...g0.slice(0, 5), ...Array(5).fill(0).map((_, i) => g1[i % g1.length])];
  const s = play({ kind: 'placement', gens, n: 10, ordered: true, wrong: new Set([0, 1, 2]) });
  const r = verifySession(C, { ...s, meta: { units: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1] } });
  assert.equal(r.xp, 10);
});
test('ออกกลางทาง: XP 0 แต่ภารกิจยังนับข้อที่ตอบ', () => {
  const s = play({ kind: 'practice', gens: ['addEq', 'barBuild'], n: 8 });
  const r = verifySession(C, { ...s, completed: false, answers: s.answers.slice(0, 3), meta: {} });
  assert.equal(r.xp, 0);
  assert.ok(r.stats.solved > 0 && r.stats.bar > 0);
});
test('แอปบอกว่าจบแต่ยังตอบข้อทวนไม่ครบ = ไม่จบ', () => {
  const s = play({ kind: 'lesson', gens: C.NODES[lessonNode].gens, n: 6, wrong: new Set([2]) });
  assert.equal(verifySession(C, { ...s, answers: s.answers.slice(0, 6), meta: { i: lessonNode } }).xp, 0);
});

// ---------- ข้อมูลที่ไม่สอดคล้องต้องถูกปฏิเสธ ----------
test('ปฏิเสธ: ตัวสร้างไม่อยู่ในบทเรียน', () => {
  const s = play({ kind: 'lesson', gens: ['brackets'], n: 6 });
  rejects(() => verifySession(C, { ...s, meta: { i: lessonNode } }), 'generator not in session');
});
test('ปฏิเสธ: ชุดตัวสร้างไม่ครบตามรอบ (เลือกแต่ข้อง่าย)', () => {
  const gens = C.NODES[lessonNode].gens;
  if (gens.length < 2) return;
  const s = play({ kind: 'lesson', gens: [gens[0]], n: 6 });
  rejects(() => verifySession(C, { ...s, meta: { i: lessonNode } }), 'generators do not match session');
});
test('ปฏิเสธ: ลำดับข้อผิด · ข้อทวนในด่านทดสอบ · ข้อทวนเปลี่ยนโจทย์', () => {
  const s = play({ kind: 'lesson', gens: C.NODES[lessonNode].gens, n: 6, wrong: new Set([1]) });
  const swapped = [...s.answers]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  rejects(() => verifySession(C, { ...s, answers: swapped, meta: { i: lessonNode } }), 'bad order of answers');
  const t = play({ kind: 'test', gens: C.NODES[testNode].gens, n: 8 });
  rejects(() => verifySession(C, { ...t, answers: [...t.answers, { ...t.answers[0], r: 1 }], meta: { i: testNode } }), 'bad retry');
  const changed = s.answers.map((x) => (x.r ? { ...x, l: 2 } : x));
  rejects(() => verifySession(C, { ...s, answers: changed, meta: { i: lessonNode } }), 'retry changed');
});
test('ปฏิเสธ: ชนิดคำตอบผิดรูปแบบ', () => {
  const s = play({ kind: 'practice', gens: ['addEq'], n: 8 });
  const bad = s.answers.map((x, i) => (i === 0 ? { ...x, a: '5' } : x));
  rejects(() => verifySession(C, { ...s, answers: bad, meta: {} }), 'bad input');
});
test('ปฏิเสธ: บทเรียนที่ไม่มีอยู่จริง', () => {
  const s = play({ kind: 'lesson', gens: C.NODES[lessonNode].gens, n: 6 });
  rejects(() => verifySession(C, { ...s, meta: { i: 999 } }), 'bad node');
  rejects(() => verifySession(C, { ...s, meta: { i: testNode } }), 'bad node');
});

// ---------- โจทย์แบบใหม่ (ระยะ 5) ----------
test('ประกอบสมการ: เรียงแบบอื่นที่ถูกก็ผ่าน · ใช้ตัวเลขหลอก/ไม่ครบ/คำตอบผิดไม่ผ่าน', () => {
  for (let s = 0; s < 200; s++) {
    const q = C.makeQuestion('buildEq', s % 3, s * 977), [a, b, c] = q.nums.map(String);
    const T = (arr) => arr.map((t) => q.tiles.indexOf(t));
    const d = q.tiles.find((t) => /^\d+$/.test(t) && !q.nums.map(String).includes(t));
    for (const ok of [[a, 'x', '+', b, '=', c], [b, '+', a, 'x', '=', c], [c, '-', b, '=', a, 'x'], [c, '=', b, '+', a, 'x']]) assert.equal(C.gradeAnswer(q, T(ok)), true, ok.join(' '));
    for (const bad of [[a, 'x', '-', b, '=', c], [a, 'x', '=', c], [d, 'x', '+', b, '=', c], ['x', '+', b, '=', c]]) assert.equal(C.gradeAnswer(q, T(bad)), false, bad.join(' '));
    assert.equal(C.gradeAnswer(q, [0, 0]), null, 'tile used twice');
  }
});
test('เส้นจำนวน: แบบตรง ต้องตรงเป๊ะ · แบบประมาณ คลาดได้ 0.3', () => {
  const q = C.makeQuestion('numlineSolve', 1, 3);
  assert.equal(C.gradeAnswer(q, q.answer), true);
  assert.equal(C.gradeAnswer(q, q.answer + 1), false);
  assert.equal(C.gradeAnswer(q, q.max + 5), null);
  const e = C.makeQuestion('estimateFrac', 1, 3);
  assert.equal(C.gradeAnswer(e, e.answer + 0.29), true);
  assert.equal(C.gradeAnswer(e, e.answer - 0.31), false);
});
test('เลือกหลายข้อ: ต้องเลือกครบและไม่เกิน', () => {
  const q = C.makeQuestion('multiEquiv', 1, 8), extra = [0, 1, 2, 3, 4].find((k) => !q.answers.includes(k));
  assert.equal(C.gradeAnswer(q, q.answers), true);
  assert.equal(C.gradeAnswer(q, [...q.answers, extra].sort()), false);
  assert.equal(C.gradeAnswer(q, [2, 1]), null, 'must be sorted');
});
test('บทเรียนที่มีโจทย์แบบใหม่: XP ตรงกับกติกา', () => {
  for (const id of ['u2l3', 'u4l1', 'u4l3', 'u5l2', 'u6l1']) {
    const i = C.NODES.findIndex((x) => x.id === id);
    assert.equal(verifySession(C, { ...play({ kind: 'lesson', gens: C.NODES[i].gens, n: 6 }), meta: { i } }).xp, 15, id);
    assert.equal(verifySession(C, { ...play({ kind: 'lesson', gens: C.NODES[i].gens, n: 6, wrong: new Set([2]) }), meta: { i } }).xp, 10, id);
  }
});

// ---------- เกมผึ้งเร่งรีบ ----------
function playTimed(seed, gapMs, rightEvery = 1, count = 1000) {
  const answers = [];
  let end = 60000, t = 0;
  for (let i = 0; i < count; i++) {
    t += gapMs;
    if (t > end) break;
    const q = C.makeTimedQuestion(C.subSeed(seed, i), () => 1);
    const ok = i % rightEvery === 0;
    const k = ok ? q.choices.indexOf(q.answer) : (q.choices.indexOf(q.answer) + 1) % 4;
    answers.push({ g: q.g, l: 1, k, t });
    end += ok ? 2000 : -5000;
    if (end <= t) break;
  }
  return { kind: 'timed', seed, completed: true, meta: {}, answers };
}
test('ผึ้งเร่งรีบ: XP = จำนวนข้อที่ถูก', () => {
  const s = playTimed(777, 3000, 2);
  const r = verifySession(C, s);
  assert.equal(r.xp, s.answers.filter((_, i) => i % 2 === 0).length);
  assert.equal(r.stats.solved, r.xp);
});
test('ผึ้งเร่งรีบ: ปฏิเสธคำตอบหลังหมดเวลา และคำตอบรัวเกินคน', () => {
  const s = playTimed(5, 3000, 2);
  const late = [...s.answers, { ...s.answers.at(-1), t: s.answers.at(-1).t + 200000 }];
  rejects(() => verifySession(C, { ...s, answers: late }));
  const fast = playTimed(5, 50, 1, 40);
  rejects(() => verifySession(C, fast), 'answers too fast');
});
test('ผึ้งเร่งรีบ: ปฏิเสธเมื่อโจทย์ไม่ตรงกับ seed', () => {
  const s = playTimed(9, 2000, 1, 40);
  rejects(() => verifySession(C, { ...s, seed: 10 }), 'question mismatch');
});

// ---------- เรื่องเล่า ----------
test('เรื่องเล่า: ตอบครบได้ 15 XP · ขาดข้อถูกปฏิเสธ', () => {
  const st = C.STORIES[0];
  const answers = st.steps.map((x, i) => (x.q ? { s: i, a: x.answer } : null)).filter(Boolean);
  assert.equal(verifySession(C, { kind: 'story', completed: true, meta: { story: st.id }, answers }).xp, 15);
  rejects(() => verifySession(C, { kind: 'story', completed: true, meta: { story: st.id }, answers: answers.slice(1) }), 'bad answers');
});

console.log(process.exitCode ? 'มีการทดสอบไม่ผ่าน' : `ผ่านทั้งหมด ${passed} การทดสอบ`);
