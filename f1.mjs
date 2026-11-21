// TPL SCORE F1 피드: Jolpica → TPL SCORE Worker
// Cloudflare 서버에서는 Jolpica가 429로 막아서 여기(GitHub Actions)서 부름.
// 비밀값(GitHub Secrets): INGEST_TOKEN, FEED_URL  ← 코드·로그에 절대 출력하지 않음. Jolpica는 키 없음.
// 무엇을 부를지는 Worker가 정함: 일정 12시간마다 1회, 결과는 결승 2시간 뒤부터 나올 때까지 30분마다.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const { INGEST_TOKEN, FEED_URL } = process.env;
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const UA = 'TPLScore/1.0 (+non-commercial fan site; github.com/tpl-studio/tpl-score-feed)'; // Jolpica는 User-Agent 필수

for (const [k, v] of Object.entries({ INGEST_TOKEN, FEED_URL })) {
  if (!v || !v.trim()) { console.log(`::warning::비밀값 ${k}가 없습니다.`); process.exit(0); }
}
const BASE = FEED_URL.trim().replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function worker(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${INGEST_TOKEN.trim()}`, 'User-Agent': 'tpl-score-feed' },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Worker ${path} HTTP ${r.status} ${data.error || ''}`);
  return data;
}

async function main() {
  const { requests } = await worker('/api/feed/f1/plan');
  if (!requests.length) { console.log('F1: 이번엔 호출 안 함'); heartbeat(); return; }
  const responses = [];
  for (const q of requests) {
    if (responses.length) await sleep(1500); // Jolpica: 초당 4회 제한 → 넉넉히
    const r = await fetch(`${JOLPICA}${q.path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const data = r.ok ? await r.json().catch(() => null) : null;
    const ok = r.ok && !!data;
    console.log(`F1 ${q.kind}${q.round ? ` R${q.round}` : ''}: ${ok ? '성공' : `실패 HTTP ${r.status}`}`);
    responses.push({ ...q, ok, status: r.status, error: ok ? null : `HTTP ${r.status}`, data: ok ? data : null });
  }
  const res = await worker('/api/feed/f1/ingest', { responses });
  console.log('Worker 저장:', JSON.stringify(res));
  heartbeat();
}

// GitHub은 60일 동안 저장소 변화가 없으면 예약 실행을 끔 → 하루 1번 상태 파일 커밋
function heartbeat() {
  const day = new Date().toISOString().slice(0, 10), f = 'status-f1.json';
  let prev = {};
  try { if (existsSync(f)) prev = JSON.parse(readFileSync(f, 'utf8')); } catch {}
  if (prev.day !== day) writeFileSync(f, JSON.stringify({ day, note: 'F1 예약 실행 유지용 (하루 1번 갱신)' }, null, 2) + '\n');
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
