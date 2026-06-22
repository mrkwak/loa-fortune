// Vercel Serverless Function (Node 18+, global fetch)
//
// 역할: 로스트아크 공식 오픈 API 프록시.
// API 키는 LOSTARK_API_KEY 환경변수에 숨기고, 프론트는 이 함수만 호출한다.
// 운세 점수/문구 계산은 전부 프론트에서 하고, 이 함수는 "캐릭터 실제 정보"만 돌려준다.
//   → 조회가 삐끗해도 그날 점수가 흔들리지 않게 분리한다.

const LOSTARK_API = "https://developer-lostark.game.onstove.com";

// "1,600.00" 같은 문자열 아이템레벨을 숫자로 정리
function parseItemLevel(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 닉네임 허용 규칙: 한글/영문/숫자 1~24자. 그 외(특수문자·공백·과도한 길이) 거부.
const NAME_RE = /^[가-힣a-zA-Z0-9]{1,24}$/;

// --- 경량 rate limit (인스턴스 메모리, best-effort) ---
// 서버리스라 인스턴스가 분산되면 완벽하진 않지만, 한 클라이언트가
// 닉을 바꿔가며 두드리는 naive 남용은 막는다. (정밀 제한은 Upstash 등 외부 저장소 필요)
const WINDOW_MS = 60_000;     // 1분 창
const PER_IP_MAX = 20;        // IP당 분당 20회
const GLOBAL_MAX = 200;       // 인스턴스 전체 분당 200회(로아 토큰 한도 보호)
const ipHits = new Map();     // ip -> number[] (요청 타임스탬프)
let globalHits = [];

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

// now를 인자로 받아 테스트/결정성 확보
function rateLimited(req, now) {
  const cut = now - WINDOW_MS;
  globalHits = globalHits.filter((t) => t > cut);
  const ip = clientIp(req);
  const arr = (ipHits.get(ip) || []).filter((t) => t > cut);

  if (arr.length >= PER_IP_MAX || globalHits.length >= GLOBAL_MAX) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  globalHits.push(now);
  ipHits.set(ip, arr);
  // 맵이 무한정 커지지 않게 가벼운 청소
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (!v.some((t) => t > cut)) ipHits.delete(k);
  }
  return false;
}

export default async function handler(req, res) {
  // GET만 허용
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ found: false, reason: "method_not_allowed" });
  }

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  // best-effort 남용 방어
  if (rateLimited(req, Date.now())) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ found: false, reason: "rate_limited" });
  }

  const name = (req.query?.name || "").toString().trim();
  if (!name) {
    return res.status(400).json({ found: false, reason: "no_name" });
  }
  // 입력 검증: 규칙에 안 맞으면 상류 호출 없이 fallback 처리
  if (!NAME_RE.test(name)) {
    return res.status(200).json({ found: false, reason: "invalid_name", name: name.slice(0, 24) });
  }

  const key = process.env.LOSTARK_API_KEY;
  // 키가 없으면 fallback: 프론트는 닉네임 기운만으로 동작
  if (!key) {
    return res.status(200).json({ found: false, reason: "no_key", name });
  }

  try {
    const url = `${LOSTARK_API}/armories/characters/${encodeURIComponent(name)}/profiles`;
    const r = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: `bearer ${key}`,
      },
    });

    // 200이지만 본문이 비어있으면(존재하지 않는 캐릭터) null이 온다
    if (r.status === 401 || r.status === 403) {
      return res.status(200).json({ found: false, reason: "bad_key", name });
    }
    if (!r.ok) {
      return res.status(200).json({ found: false, reason: `http_${r.status}`, name });
    }

    const text = await r.text();
    if (!text || text === "null") {
      return res.status(200).json({ found: false, reason: "not_found", name });
    }

    const p = JSON.parse(text);
    if (!p || !p.CharacterName) {
      return res.status(200).json({ found: false, reason: "not_found", name });
    }

    return res.status(200).json({
      found: true,
      name: p.CharacterName,
      className: p.CharacterClassName || null,
      itemLevel: parseItemLevel(p.ItemMaxLevel || p.ItemAvgLevel),
      server: p.ServerName || null,
    });
  } catch (e) {
    // 네트워크/파싱 실패도 fallback으로
    return res.status(200).json({ found: false, reason: "error", name });
  }
}
