export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment variables." });
    }

    const { mode, todayISO, activityType, recent } = req.body || {};

    // 매우 단순한 입력 검증
    const type = activityType === "run" ? "run" : "study";
    const recentText = Array.isArray(recent)
      ? recent.slice(-20).map(r => JSON.stringify(r)).join("\n")
      : "";

    const system = `
너는 '레벨업' 앱의 미션 디자이너다.
원칙:
- 미션은 10~20분 안에 끝나야 한다.
- 사용자가 당장 실행 가능한 행동이어야 한다.
- 측정 가능하거나 완료 체크가 가능한 형태여야 한다.
- 자책/비하/공격적인 표현 금지.
출력은 반드시 아래 형식의 JSON만 출력한다. (코드블록 금지)
{"missionText":"...","weeklyComment":"..."}
    `.trim();

    const user = `
오늘 날짜: ${todayISO}
오늘 활동 타입: ${type} (run=운동/러닝, study=공부)
최근 7일 요약(최대 20개):
${recentText}

요청:
- missionText: 오늘 미션 1개(한 문장)
- weeklyComment: 이번 주를 관통하는 조언 1줄(너무 길지 않게)
    `.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "OpenAI request failed", raw: data });
    }

    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "";

    // JSON 파싱 시도
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // JSON이 아니면 최소한의 안전한 폴백
      parsed = {
        missionText: type === "run"
          ? "오늘 미션: 러닝 후 스트레칭 8분 하고 완료 체크"
          : "오늘 미션: 내일 할 일 3개 적고 완료 체크",
        weeklyComment: "이번 주는 '작게 시작해서 끊기지 않는 것'에만 집중해라."
      };
    }

    return res.status(200).json({
      missionText: String(parsed.missionText || "").trim(),
      weeklyComment: String(parsed.weeklyComment || "").trim()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
