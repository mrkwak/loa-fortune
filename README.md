# 로아 오늘의 운세 (비공식 팬메이드)

로스트아크 유저용 **재미용 "오늘의 운세"** 페이지입니다. 닉네임을 넣으면 그날의
재련운·품질운·카드운·골드운·파티원운·직업운을 보여줍니다.

> ⚠️ 비공식 팬메이드입니다. **스마일게이트 / 로스트아크와 아무 관련이 없습니다.**
> 운세는 100% 재미용이며 어떤 예측도 아닙니다. (바넘 효과 기반)

## 구조

- `index.html` — 순수 정적 프론트(빌드 도구 없음). 운세 점수·문구 계산은 전부 여기서.
- `api/fortune.js` — Vercel 서버리스 함수. **로스트아크 공식 API 프록시**.
  API 키는 환경변수에 숨기고, 브라우저는 이 함수만 호출합니다.
- 닉네임이 노출 안 됨 → 키는 `LOSTARK_API_KEY` 환경변수에만 둡니다.

### 운세 로직 요약
- `닉네임 + 날짜(KST) + 카테고리`를 해시 시드로 한 결정적 RNG(xmur3 + mulberry32)
  → **같은 닉네임은 그날 하루 몇 번을 봐도 같은 결과**, 자정(KST)에 갱신.
- 클래스명은 시드에 넣지 않음 → API 조회가 실패해도 그날 점수는 안 흔들림.
  클래스는 **직업운 문구 치환에만** 사용.
- 점수(0~100)는 평~길이 흔하고 대흉/대길이 드물게 **중앙 편향**.
- 등급(대흉/흉/평/길/대길)과 문구 톤을 일치(good/mid/bad 풀에서만 추출).
- 조회 실패/키 없음이면 닉네임 기운만으로 동작(fallback).

## 배포 순서

### 1) 로스트아크 API 키 발급
1. https://developer-lostark.game.onstove.com 접속 → 스토브 로그인
2. **API Key 발급** (마이페이지 / API 관리)
3. 발급된 토큰 문자열을 복사해 둡니다. (이 값이 `LOSTARK_API_KEY`)

### 2) Vercel에 배포 (GitHub 연동, 권장)
1. https://vercel.com 로그인 → **Add New… → Project**
2. **Import Git Repository** 에서 이 저장소(`loa-fortune`) 선택
3. Framework Preset: **Other** (빌드 설정 불필요, 그대로 Deploy)
4. 배포 후 자동으로 `https://<프로젝트>.vercel.app` 주소가 생깁니다.

### 3) 환경변수 등록 (중요)
1. Vercel 프로젝트 → **Settings → Environment Variables**
2. 추가:
   - Name: `LOSTARK_API_KEY`
   - Value: 1)에서 발급한 토큰
   - Environment: Production (+ Preview 원하면 같이)
3. 저장 후 **Deployments → 최신 배포 → Redeploy** (환경변수는 재배포해야 적용)

> 환경변수를 등록하지 않아도 페이지는 동작합니다. 다만 캐릭터 클래스/아이템레벨
> 조회가 빠지고 **닉네임 기운만으로** 보는 fallback 모드가 됩니다.

## 로컬에서 돌려보기 (선택)
정적 파일이라 `index.html`만 열어도 화면은 뜨지만, `/api/fortune` 호출은
Vercel 런타임이 필요합니다. 함께 테스트하려면:

```bash
npm i -g vercel      # 최초 1회
vercel dev           # http://localhost:3000
```

`vercel dev` 사용 시 프로젝트 루트에 `.env.local` 을 만들고
`LOSTARK_API_KEY=발급받은키` 를 넣으세요. (`.gitignore` 에 이미 포함, 커밋 금지)

## 기술 메모
- Node 18+ (global `fetch` 사용)
- 이미지/공식 로고/일러스트 미사용 (IP 안전, 텍스트만)
