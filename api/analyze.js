export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { screen, minutes, reason, intended } = req.body;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "너는 사용자의 하루를 냉정하게 평가하는 분석자다. 공감이나 위로는 하지 마라."
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

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: errorText });
    }

    const data = await response.json();

    res.status(200).json({
      result: data.choices[0].message.content
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
