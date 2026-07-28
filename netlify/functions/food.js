// 식약처 식품영양성분 API를 서버에서 호출 (CORS·프록시 문제 해결)
export async function handler(event) {
  const name = (event.queryStringParameters?.name || "").trim();
  const key = process.env.FOOD_API_KEY;
  if (!name) return json(400, { error: "no name" });
  if (!key)  return json(500, { error: "FOOD_API_KEY 환경변수가 설정되지 않았어요" });

  const base = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";
  const url = `${base}?serviceKey=${encodeURIComponent(key)}&pageNo=1&numOfRows=20&type=json&FOOD_NM_KR=${encodeURIComponent(name)}`;

  try {
    const res = await fetch(url);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return json(502, { error: "API 응답 파싱 실패", raw: text.slice(0, 300) }); }

    // 응답 구조 방어적 파싱
    let rows = [];
    if (data?.body?.items) rows = data.body.items;
    else if (data?.response?.body?.items) rows = data.response.body.items;
    else if (Array.isArray(data?.items)) rows = data.items;
    else { const k = Object.keys(data || {}).find(k => data[k]?.row); if (k) rows = data[k].row; }
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];

    const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
    const items = rows.map(r => {
      // 영양성분 기준량 (보통 100g) — 이 값 기준으로 kcal/영양소가 표기됨
      const perBase = num(String(r.NUTR_CONT_SRTR_QUA ?? r.SERVING_UNIT ?? "100").replace(/[^0-9.]/g, "")) || 100;
      // 1회 제공량 / 총 중량 (1개가 몇 g인지) — 여러 후보 필드
      const serving = num(String(
        r.SERVING_SIZE ?? r.Z10500 ?? r.FOOD_WEIGHT ?? r.SERVING_WT ?? r["1회제공량"] ?? ""
      ).replace(/[^0-9.]/g, ""));
      return {
        name: r.FOOD_NM_KR || r.DESC_KOR || r["식품명"] || "",
        kcal: num(r.AMT_NUM1 ?? r.NUTR_CONT1 ?? r.enerc),
        carb: num(r.AMT_NUM2 ?? r.NUTR_CONT2),
        prot: num(r.AMT_NUM3 ?? r.NUTR_CONT3),
        fat:  num(r.AMT_NUM4 ?? r.NUTR_CONT4),
        base: perBase,              // 영양수치가 몇 g 기준인지 (보통 100)
        serving: serving || null,   // 1개/1회분이 몇 g인지 (있으면)
      };
    }).filter(x => x.name);

    return json(200, { items });
  } catch (e) {
    return json(502, { error: "API 호출 실패: " + e.message });
  }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}
