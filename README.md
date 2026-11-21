# TPL SCORE 야구·농구 피드

TPL SCORE 사이트의 야구(MLB·KBO)·농구(NBA) 일정과 점수를 [API-SPORTS](https://api-sports.io) 무료 등급에서 받아 사이트에 넘겨주는 GitHub Actions입니다.

- 15분마다 실행되지만, API-SPORTS를 실제로 부르는 건 **경기 중**이거나 **하루 1번 일정 확인** 때뿐입니다.
- 한 번 호출로 그날 경기를 전부 받습니다 (야구는 MLB·KBO 한 번에).
- 종목별 하루 80회에서 멈춥니다 (무료 한도 100회).
- 방문자는 사이트에 저장된 결과만 봅니다. 방문자가 많아도 호출 수는 늘지 않습니다.

비밀값(Settings → Secrets and variables → Actions): `APISPORTS_KEY`, `INGEST_TOKEN`, `FEED_URL`
수동 점검: Actions → "TPL SCORE 야구·농구 피드" → Run workflow → mode `check`
