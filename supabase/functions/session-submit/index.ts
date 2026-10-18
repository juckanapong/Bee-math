// BeeMath · Edge Function: ตรวจรอบเรียนและภารกิจ แล้วบวก XP ลีก
// deploy: npx supabase functions deploy session-submit --project-ref vgzyystxqwtchtianjzw (ดู README)
//
// POST { type: 'session', id, kind, meta, completed, answers }  → { xp, league_xp, boosted }
// POST { type: 'claim', quest, day }                             → { xp, league_xp }
// รหัสตอบกลับ: 200 สำเร็จ · 401 ยังไม่ล็อกอิน · 422 ไม่ผ่านการตรวจ (แอปไม่ส่งซ้ำ) · 500 ผิดพลาดชั่วคราว (แอปส่งซ้ำ)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as C from '../_shared/content.mjs';
import * as P from '../_shared/content_prev.mjs'; // เนื้อหารุ่นก่อนหน้า (tools/build-shared.mjs)
import { QUEST_METRIC, Rejected, verifySession } from '../_shared/verify.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'not signed in' }, 401);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 422);
    if (body.type === 'session') return await submitSession(user.id, body);
    if (body.type === 'claim') return await claimQuest(user.id, body);
    return json({ error: 'unknown type' }, 422);
  } catch (e) {
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
});

async function submitSession(uid: string, body: Record<string, unknown>) {
  const id = String(body.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad id' }, 422);
  const { data: s, error } = await admin.rpc('session_get', { p_user: uid, p_id: id });
  if (error) throw error;
  if (!s) return json({ error: 'unknown session' }, 422); // ไม่ได้แจ้งเริ่มรอบ (ออฟไลน์ตอนเริ่ม) หรือไม่ใช่ของผู้ใช้นี้
  if (s.submitted) return json({ xp: s.xp, league_xp: s.league_xp, boosted: s.boosted, duplicate: true });
  if (body.kind !== s.kind) return reject(uid, id, 'kind mismatch');

  // ตรวจกับเนื้อหารุ่นปัจจุบันก่อน ถ้าไม่ผ่านลองรุ่นก่อนหน้า (แอปที่ยังไม่ได้อัปเดตระหว่างปล่อยรุ่นใหม่)
  const input = { kind: s.kind, seed: Number(s.seed), meta: body.meta, completed: body.completed, answers: body.answers };
  let r, content = 'current';
  try {
    r = verifySession(C, input);
  } catch (e) {
    if (!(e instanceof Rejected)) throw e;
    try {
      r = verifySession(P, input);
      content = 'previous';
    } catch (e2) {
      if (e2 instanceof Rejected) return reject(uid, id, e.message);
      throw e2;
    }
  }
  if (Number(s.elapsed_ms) < r.minMs) return reject(uid, id, 'too fast', r.summary);

  const { data, error: err2 } = await admin.rpc('session_complete', {
    p_user: uid, p_id: id, p_xp: r.xp, p_stats: r.stats, p_result: { ...r.summary, content },
  });
  if (err2) throw err2;
  if (!data?.duplicate) await feedFromSession(uid, s.kind, body.meta, r.summary);
  return json(data);
}

// ฟีดเพื่อน (supabase/notify_feed.sql): ผ่านด่านทดสอบ → unit · ผ่านระดับตำนาน → legend (ครั้งแรกของแต่ละบท)
// ไม่ให้ความผิดพลาดของฟีดทำให้การส่งผลรอบเรียนล้มเหลว
async function feedFromSession(uid: string, kind: string, meta: unknown, summary: Record<string, unknown>) {
  if (!summary?.passed || (kind !== 'test' && kind !== 'legend')) return;
  const m = (meta ?? {}) as { i?: number; unit?: string };
  const ui = kind === 'test' ? C.NODES[m.i ?? -1]?.ui : C.UNITS.findIndex((u: { id: string }) => u.id === m.unit);
  if (ui === undefined || ui < 0) return;
  const { error } = await admin.rpc('feed_add', {
    p_user: uid, p_kind: kind === 'test' ? 'unit' : 'legend', p_data: { unit: ui + 1, title: C.UNITS[ui].title }, p_dedupe: `${kind}:${ui}`,
  });
  if (error && !/does not exist/.test(error.message)) console.error('feed_add', error);
}

// บันทึกว่ารอบนี้ไม่ผ่านการตรวจ (XP 0) เพื่อให้ตรวจย้อนหลังได้ แล้วตอบ 422
async function reject(uid: string, id: string, reason: string, summary: unknown = null) {
  const { error } = await admin.rpc('session_complete', {
    p_user: uid, p_id: id, p_xp: 0, p_stats: {}, p_result: { rejected: reason, summary },
  });
  if (error) throw error;
  return json({ error: 'rejected', reason }, 422);
}

async function claimQuest(uid: string, body: Record<string, unknown>) {
  const q = C.QUESTS.find((x: { id: string }) => x.id === body.quest);
  const day = String(body.day ?? '');
  if (!q || !QUEST_METRIC[q.id as keyof typeof QUEST_METRIC] || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'bad claim' }, 422);
  const { data, error } = await admin.rpc('quest_claim', {
    p_user: uid, p_day: day, p_quest: q.id, p_metric: QUEST_METRIC[q.id as keyof typeof QUEST_METRIC], p_goal: q.goal, p_reward: q.reward,
  });
  if (error) {
    if (/quest not done|claim expired/.test(error.message)) return json({ error: 'rejected', reason: error.message }, 422);
    throw error;
  }
  return json(data);
}
