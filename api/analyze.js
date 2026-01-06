export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { screen, minutes, reason, intended } = req.body;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: "너는 사용자의 하루를 냉정하게 평가하는 분석자다. 공감이나 위로는 하지 마라."
          },
          {
            role: "user",
            content: `
1. 가장 오래 본 화면: ${screen}
2. 사용 시간: ${minutes}분
3. 이유: ${reason}
4. 원래 하려던 일: ${intended}

다음 형식으로만 답변하라.
1. 오늘 가장 낭비된 시간 요약
2. 이 행동의 회피 패턴 분석
3. 내일 반드시 지켜야 할 단 하나의 행동 제약
`
          }
        ]
      })
    });

    const data = await response.json();

    // 🔴 여기서 안전하게 꺼낸다
    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "AI 응답이 비어 있습니다.",
        raw: data
      });
    }

    res.status(200).json({ result: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
