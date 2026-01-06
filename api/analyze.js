export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1) API KEY 체크 (가장 먼저)
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "OPENAI_API_KEY is missing in env" });
    }

    // 2) fetch 존재 체크 (런타임 문제를 즉시 드러냄)
    if (typeof fetch !== "function") {
      return res.status(500).json({ error: "fetch is not available in this runtime" });
    }

    // 3) body 체크 (비어있으면 바로 반환)
    const body = req.body || {};
    const { screen, minutes, reason, intended } = body;

    if (!screen || !minutes || !reason || !intended) {
      return res.status(400).json({
        error: "Missing required fields",
        received: { screen, minutes, reason, intended }
      });
    }

    // 4) OpenAI 호출
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "너는 사용자의 하루를 냉정하게 평가하는 분석자다. 공감, 위로, 격려, 감정적 표현을 절대 사용하지 마라. 짧고 단정적으로 말하라. 반드시 3줄만 출력하라."
          },
          {
            role: "user",
            content: [
              `1. 가장 오래 본 화면: ${screen}`,
              `2. 사용 시간: ${minutes}분`,
              `3. 이유: ${reason}`,
              `4. 원래 하려던 일: ${intended}`,
              "",
              "다음 형식으로만 답변하라.",
              "1. 오늘 가장 낭비된 시간 요약 (한 문장)",
              "2. 이 행동의 회피 패턴 분석 (한 문장)",
              "3. 내일 반드시 지켜야 할 단 하나의 행동 제약 (명령문)"
            ].join("\n")
          }
        ]
      })
    });

    // 5) OpenAI가 에러면 그대로 반환 (중요)
    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return res.status(500).json({
        error: "OpenAI request failed",
        status: response.status,
        detail: errText
      });
    }

    const data = await response.json();

    // 6) 텍스트 안전 추출
    const text =
      data.output_text ||
      data.output?.[0]?.content?.find(c => c.type === "output_text")?.text ||
      data.output?.[0]?.content?.[0]?.text;

    if (!text) {
      return res.status(500).json({ error: "Empty AI response", raw: data });
    }

    return res.status(200).json({ result: text });
  } catch (err) {
    return res.status(500).json({
      error: "Unhandled server error",
      message: err?.message,
      stack: err?.stack
    });
  }
}
