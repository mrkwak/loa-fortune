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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const name = (req.query?.name || "").toString().trim();
  if (!name) {
    return res.status(400).json({ found: false, reason: "no_name" });
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
