# TPL SCORE 야구 피드

TPL SCORE 사이트의 야구(MLB·KBO) 일정과 점수를 [API-SPORTS](https://api-sports.io) 무료 등급에서 받아 사이트에 넘겨주는 GitHub Actions입니다.

- 무료 플랜은 어제·오늘·내일만 조회할 수 있어서, 야구는 내일 경기까지 보입니다.
- 15분마다 실행되지만, API-SPORTS를 실제로 부르는 건 **경기 중**이거나 **하루 1번 일정 확인** 때뿐입니다.
- 한 번 호출로 그날 경기를 전부 받습니다 (야구는 MLB·KBO 한 번에).
- 종목별 하루 80회에서 멈춥니다 (무료 한도 100회).
- 방문자는 사이트에 저장된 결과만 봅니다. 방문자가 많아도 호출 수는 늘지 않습니다.

비밀값(Settings → Secrets and variables → Actions): `APISPORTS_KEY`, `INGEST_TOKEN`, `FEED_URL`
수동 점검: Actions → "TPL SCORE 야구·농구 피드" → Run workflow → mode `check`

## F1 (f1.yml)
- [Jolpica](https://github.com/jolpica/jolpica-f1) F1 데이터(키 없음, 비상업 무료, CC BY-NC-SA 4.0)를 받아 사이트에 넘깁니다. Cloudflare 서버에서는 Jolpica가 막아서 여기서 부릅니다.
- 레이스 주말(UTC 금~월)에만 30분마다 깨어나고, 실제 호출은 일정 12시간마다 1회, 결승 뒤 결과가 나올 때까지 30분마다뿐입니다.
- 야구 피드(feed.yml) 예약 실행은 꺼져 있습니다.
