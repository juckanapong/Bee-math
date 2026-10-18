// BeeMath · Edge Function: ส่งแจ้งเตือนให้มาเรียน (เรียกจาก pg_cron ทุก 15 นาที ดู README หัวข้อ "แจ้งเตือน Push")
// deploy: npx supabase functions deploy push-send --project-ref vgzyystxqwtchtianjzw --use-api --no-verify-jwt
// ความลับ (supabase secrets set): CRON_SECRET · VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT (mailto:...)
// ป้องกันด้วย header x-cron-secret (ไม่ใช้ JWT เพราะ pg_cron เป็นผู้เรียก)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SITE = 'https://juckanapong.github.io/Bee-math/';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ข้อความให้กำลังใจ (ไม่ใช้ชื่อ เพราะแสดงบนหน้าจอล็อก · ไม่ทำให้รู้สึกผิด)
const message = (streak: number) => streak > 0
  ? { title: 'น้องผึ้งรออยู่', body: `สตรีค ${streak} วันของคุณรออยู่ มาเรียนสัก 1 บทนะ` }
  : { title: 'น้องผึ้งรออยู่', body: 'มาฝึกแก้สมการกับน้องผึ้งกันเถอะ ใช้เวลาแค่ไม่กี่นาที' };

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);
  const vapid = { subject: Deno.env.get('VAPID_SUBJECT')!, publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!, privateKey: Deno.env.get('VAPID_PRIVATE_KEY')! };
  const { data: due, error } = await admin.rpc('push_due');
  if (error) { console.error(error); return json({ error: 'push_due failed' }, 500); }
  const sent: string[] = [], gone: string[] = [], failed: number[] = [];
  const rows = (due ?? []) as { endpoint: string; p256dh: string; auth: string; streak: number }[];
  // ส่งทีละ 20 เครื่อง
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (r) => {
      try {
        const d = webpush.generateRequestDetails(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify({ ...message(r.streak), url: SITE }),
          { vapidDetails: vapid, TTL: 4 * 3600, urgency: 'normal' },
        );
        const res = await fetch(d.endpoint, { method: 'POST', headers: d.headers as Record<string, string>, body: d.body });
        if (res.ok) sent.push(r.endpoint);
        else if (res.status === 404 || res.status === 410) gone.push(r.endpoint); // ผู้ใช้ยกเลิก/การสมัครหมดอายุ
        else failed.push(res.status);
        await res.body?.cancel();
      } catch (e) {
        console.error('push failed', e);
        failed.push(0);
      }
    }));
  }
  if (sent.length || gone.length) {
    const { error: e2 } = await admin.rpc('push_mark', { p_sent: sent, p_gone: gone });
    if (e2) console.error(e2);
  }
  return json({ due: rows.length, sent: sent.length, gone: gone.length, failed });
});
