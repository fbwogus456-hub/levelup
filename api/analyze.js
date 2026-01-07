export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY in environment variables."
      });
    }

    const body = req.body || {};
    const mode = String(body.mode || "mission");

    // ===== 공통: OpenAI 호출 helper =====
    async function callOpenAI({ system, user }) {
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

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data?.error?.message || "OpenAI request failed",
          raw: data
        };
      }

      const text =
        data.output_text ||
        data.output?.[0]?.content?.[0]?.text ||
        "";

      return { ok: true, text };
    }

    // ===== MODE: mission =====
    if (mode === "mission") {
      const todayISO = String(body.todayISO || "").trim();
      const activityType = body.activityType === "run" ? "run" : "study";
      const recent = Array.isArray(body.recent) ? body.recent : [];

      // 최소 입력 검증
      if (!todayISO) {
        return res.status(400).json({ error: "Missing todayISO" });
      }

      const recentText = recent
        .slice(-20)
        .map(r => {
          try {
            return JSON.stringify(r);
          } catch {
            return String(r);
          }
        })
        .join("\n");

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
오늘 활동 타입: ${activityType} (run=운동/러닝, study=공부)
최근 7일 요약(최대 20개):
${recentText}

요청:
- missionText: 오늘 미션 1개(한 문장)
- weeklyComment: 이번 주를 관통하는 조언 1줄(너무 길지 않게)
      `.trim();

      const r = await callOpenAI({ system, user });

      if (!r.ok) {
        return res.status(r.status).json({ error: r.error, raw: r.raw });
      }

      // JSON 파싱 시도
      let parsed = null;
      try {
        parsed = JSON.parse(r.text);
      } catch {
        parsed = {
          missionText: activityType === "run"
            ? "오늘 미션: 러닝 후 스트레칭 8분 하고 완료 체크"
            : "오늘 미션: 내일 할 일 3개 적고 완료 체크",
          weeklyComment: "이번 주는 '작게 시작해서 끊기지 않는 것'에만 집중해라."
        };
      }

      return res.status(200).json({
        missionText: String(parsed.missionText || "").trim(),
        weeklyComment: String(parsed.weeklyComment || "").trim()
      });
    }

    // ===== MODE: nudge =====
    if (mode === "nudge") {
      const todayISO = String(body.todayISO || "").trim();
      const yesterdayISO = String(body.yesterdayISO || "").trim();
      const yesterdayXP = Number(body.yesterdayXP);
      const todayGoalXP = Number(body.todayGoalXP);
      const minKeepXP = Number(body.minKeepXP);
      const deltaToGoalXP = Number(body.deltaToGoalXP);
      const deltaToKeepXP = Number(body.deltaToKeepXP);
      const level = String(body.level || "").trim();
      const score = Number(body.score);

      // 최소 입력 검증
      if (!todayISO || !yesterdayISO) {
        return res.status(400).json({ error: "Missing todayISO/yesterdayISO" });
      }

      const yXP = Number.isFinite(yesterdayXP) ? yesterdayXP : 0;
      const goal = Number.isFinite(todayGoalXP) ? todayGoalXP : 0;
      const delta = Math.max(0, goal - yXP);

      const system = `
너는 '레벨업' 앱의 코치다.
목표:
- 사용자가 오늘 행동하게 만드는 짧은 압박 문구를 만든다.
규칙:
- 공격/비하/욕설/혐오 금지.
- 과장된 성공팔이 금지.
- 1~2문장, 80자 내외.
- 숫자를 반드시 포함: (어제 XP, 오늘 목표 XP, 필요한 추가 XP 중 최소 1개)
- 마지막은 행동 촉구(예: "지금 10분만 해라.")로 끝내라.
출력은 반드시 아래 형식의 JSON만 출력한다. (코드블록 금지)
{"nudgeText":"..."}
      `.trim();

      const user = `
오늘: ${todayISO}
어제: ${yesterdayISO}
현재 레벨: ${level || "-"}
현재 SCORE: ${Number.isFinite(score) ? score : "-"}

어제 XP: ${yXP}
오늘 목표 XP: ${goal}
레벨 유지 최소 XP: ${Number.isFinite(minKeepXP) ? minKeepXP : "-"}
유지까지 필요한 추가 XP: ${Number.isFinite(deltaToKeepXP) ? deltaToKeepXP : "-"}오늘 최소 추가 필요 XP: ${delta}

요청:
- nudgeText에 위 수치를 활용해 짧고 단호한 문구 1개를 만들어라.
      `.trim();

      const r = await callOpenAI({ system, user });

      if (!r.ok) {
        return res.status(r.status).json({ error: r.error, raw: r.raw });
      }

      let parsed = null;
      try {
        parsed = JSON.parse(r.text);
      } catch {
        parsed = {
          nudgeText: `유지 최소 ${Number.isFinite(minKeepXP) ? minKeepXP : goal}XP. 지금은 +${Number.isFinite(deltaToKeepXP) ? deltaToKeepXP : Math.max(0, goal - yXP)}XP만 채워라. 지금 10분만 해라.`
        };
      }

      return res.status(200).json({
        nudgeText: String(parsed.nudgeText || "").trim()
      });
    }

    // ===== unknown mode =====
    return res.status(400).json({ error: `Unknown mode: ${mode}` });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
