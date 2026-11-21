// TPL SCORE 야구·농구 피드: API-SPORTS → TPL SCORE Worker
// 비밀값(GitHub Secrets): APISPORTS_KEY, INGEST_TOKEN, FEED_URL  ← 코드·로그에 절대 출력하지 않음
// 사용: node feed.mjs          (평소: Worker가 정해 준 날짜만 호출)
//       node feed.mjs check    (점검: 플랜·리그 번호·시즌 접근 확인, 약 4회 사용)
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const { APISPORTS_KEY, INGEST_TOKEN, FEED_URL } = process.env;
const MODE = process.argv[2] || 'run';
const GAP_MS = 7000; // API-SPORTS 분당 한도 보호: 호출 사이 7초

for (const [k, v] of Object.entries({ APISPORTS_KEY, INGEST_TOKEN, FEED_URL })) {
  if (!v || !v.trim()) { console.log(`::warning::비밀값 ${k}가 없습니다. 저장소 Settings → Secrets and variables → Actions 에 넣어 주세요.`); process.exit(0); }
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

let lastCall = 0;
async function apisports(host, path) {
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const r = await fetch(`https://${host}${path}`, { headers: { 'x-apisports-key': APISPORTS_KEY.trim() } });
  const data = await r.json().catch(() => ({}));
  const errs = data.errors && (Array.isArray(data.errors) ? data.errors : Object.values(data.errors));
  return {
    ok: r.ok && !(errs && errs.length),
    error: errs && errs.length ? errs.join(' / ') : (r.ok ? null : `HTTP ${r.status}`),
    remaining: r.headers.get('x-ratelimit-requests-remaining'),
    data,
  };
}

// 필요한 리그만, 필요한 칸만 간추려서 Worker로 (전송량·Worker 처리시간 절약)
function slim(games, keep) {
  return (games || []).filter((g) => (keep.ids || []).includes(g.league?.id) || (keep.names || []).some((n) => new RegExp(`^${n}`, 'i').test(g.league?.name || '')))
    .map((g) => ({
      id: g.id, ts: g.timestamp, date: g.date, st: g.status?.short, timer: g.status?.timer ?? null,
      league: { id: g.league?.id, name: g.league?.name, type: g.league?.type }, stage: g.stage ?? null,
      home: g.teams?.home?.name, away: g.teams?.away?.name, hs: g.scores?.home?.total ?? null, as: g.scores?.away?.total ?? null,
    }));
}

async function run() {
  const plan = await worker('/api/feed/plan');
  const report = { sports: {} };
  let total = 0;
  for (const [sport, p] of Object.entries(plan.sports)) {
    const results = [];
    for (const { date, path } of p.dates) {
      const r = await apisports(p.host, path);
      const games = r.ok ? slim(r.data.response, p.keep) : [];
      results.push({ date, ok: r.ok, error: r.error, remaining: r.remaining, games });
      console.log(`${sport} ${date}: ${r.ok ? `${games.length}경기` : `실패 (${r.error})`} · 서버 남은 한도 ${r.remaining ?? '?'}`);
      total++;
      if (!r.ok && /do not have access to this date/i.test(r.error || '')) continue; // 무료 플랜 범위 밖 날짜 → 건너뜀
      if (!r.ok) break; // 분당 한도 등 → 다음 실행(15분 뒤)에 이어서
      if (r.remaining != null && Number(r.remaining) <= 100 - plan.cap) { console.log(`${sport}: 남은 한도가 적어 멈춤`); break; }
    }
    if (p.notes?.length) console.log(`${sport}: ${p.notes.join(' · ')}`);
    if (!p.dates.length) console.log(`${sport}: 이번엔 호출 안 함 (경기 시간대 아님)`);
    report.sports[sport] = { results };
  }
  if (total) {
    const res = await worker('/api/feed/ingest', report);
    console.log('Worker 저장:', JSON.stringify(res));
  } else {
    console.log('API-SPORTS 호출 0회');
  }
  heartbeat(total);
}

// GitHub은 60일 동안 저장소 변화가 없으면 예약 실행을 끔 → 하루 1번 상태 파일을 커밋해서 유지
function heartbeat(calls) {
  const day = new Date().toISOString().slice(0, 10);
  const f = 'status.json';
  let prev = {};
  try { if (existsSync(f)) prev = JSON.parse(readFileSync(f, 'utf8')); } catch {}
  if (prev.day !== day) writeFileSync(f, JSON.stringify({ day, note: '예약 실행 유지용 (하루 1번 갱신)' }, null, 2) + '\n');
}

async function check() {
  const BB = 'v1.baseball.api-sports.io', BK = 'v1.basketball.api-sports.io';
  for (const [name, host] of [['야구', BB], ['농구', BK]]) {
    const s = await apisports(host, '/status'); // 한도에 안 셈
    const sub = s.data?.response?.subscription, req = s.data?.response?.requests;
    console.log(`[${name} 상태] ${s.ok ? `플랜 ${sub?.plan} · 활성 ${sub?.active} · 오늘 ${req?.current}/${req?.limit_day}` : `실패: ${s.error}`}`);
  }
  for (const [label, host, q] of [['야구 KBO', BB, '/leagues?search=KBO'], ['야구 MLB', BB, '/leagues?search=MLB'], ['농구 NBA', BK, '/leagues?search=NBA']]) {
    const r = await apisports(host, q);
    if (!r.ok) { console.log(`[${label}] 실패: ${r.error}`); continue; }
    for (const l of (r.data.response || []).slice(0, 5)) {
      console.log(`[${label}] id ${l.id} · ${l.name} · ${l.country?.name} · 시즌 ${(l.seasons || []).map((x) => x.season).slice(-3).join(', ')}`);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const t = await apisports(BB, `/games?date=${today}&timezone=UTC`);
  if (!t.ok) console.log(`[${today} 야구] 실패: ${t.error}`);
  else { const by = {}; for (const x of t.data.response || []) { const k = `${x.league?.name} (시즌 ${x.league?.season})`; by[k] = (by[k] || 0) + 1; } console.log(`[${today} 야구 전체 리그] ${JSON.stringify(by)}`); }
  const g = await apisports(BB, '/games?date=2026-07-01&timezone=UTC');
  if (!g.ok) console.log(`[2026-07-01 야구] 실패: ${g.error}`);
  else {
    const by = {};
    for (const x of g.data.response || []) by[x.league?.name] = (by[x.league?.name] || 0) + 1;
    console.log(`[2026-07-01 야구] 리그별 경기 수 ${JSON.stringify(by)}`);
  }
}

(MODE === 'check' ? check() : run()).catch((e) => { console.error('실패:', e.message); process.exit(1); });
