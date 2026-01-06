document.getElementById("submitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("submitBtn");

  // 🔒 연타 방지 시작
  btn.disabled = true;
  const originalText = btn.innerText;
  btn.innerText = "분석 중...";

  try {
    const screen = document.getElementById("screen").value;
    const minutes = document.getElementById("minutes").value;
    const intended = document.getElementById("intended").value;

    const reasonEl = document.querySelector('input[name="reason"]:checked');
    if (!reasonEl) {
      alert("보기 시작한 이유를 선택해라.");
      return;
    }
    const reason = reasonEl.value;

    if (!minutes || !intended) {
      alert("모든 입력을 채워라.");
      return;
    }

    const text = await getAnalysis({ screen, minutes, reason, intended });

    const score = calcScore(minutes, reason);
    const level = calcLevel(score);

    showResultText(text, { score, level });

    addHistory({
      date: new Date().toLocaleDateString("ko-KR"),
      screen,
      minutes,
      reason,
      intended,
      score,
      level,
      resultText: text
    });


  } catch (e) {
    document.getElementById("result").innerText =
      "에러 발생: " + (e.message || e);
  } finally {
    // 🔓 연타 방지 해제 (무조건 실행)
    btn.disabled = false;
    btn.innerText = originalText;
  }
});


async function getAnalysis(data) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!response.ok) {
    const detail = result.detail ? `\n\nDETAIL:\n${result.detail}` : "";
    const status = result.status ? `\nSTATUS: ${result.status}` : "";
    throw new Error((result.error || "Request failed") + status + detail);
  }

  return result.result;
}

const STORAGE_KEY = "levelup_history_v1";
const HISTORY_LIMIT = 10;     // 저장은 10개까지
const HISTORY_SHOW = 7;       // 화면에는 7개만 보여줌

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function addHistory(item) {
  const items = loadHistory();
  items.unshift(item); // 최신이 위로
  const trimmed = items.slice(0, HISTORY_LIMIT);
  saveHistory(trimmed);
  renderHistory();
}

function renderHistory() {
  const listEl = document.getElementById("historyList");
  if (!listEl) return;

  const items = loadHistory().slice(0, HISTORY_SHOW);

  if (items.length === 0) {
    listEl.innerHTML = "<li>기록이 없다.</li>";
    return;
  }

  listEl.innerHTML = items
    .map((it, idx) => {
      const title = `${it.date} · ${it.level || "-"} ${it.score ?? "-"}점 · ${it.screen} ${it.minutes}분 · ${it.reason}`;
      return `<li style="margin:8px 0;">
        <button type="button" data-index="${idx}" class="historyItemBtn">${title}</button>
      </li>`;
    })
    .join("");

  // 클릭 이벤트 연결
  document.querySelectorAll(".historyItemBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const index = Number(e.currentTarget.dataset.index);
      const picked = loadHistory()[index];
      if (!picked) return;

      // 결과 다시 표시
      showResultText(picked.resultText, { score: picked.score, level: picked.level });
    });
  });
}

function showResultText(text, meta) {
  const lines = String(text).split("\n").filter(l => l.trim() !== "");
  const scoreLine = meta ? `레벨: ${meta.level} · 점수: ${meta.score}점` : "";

  // 1줄은 AI가 써도 되지만, 너는 제품을 만든다. 1줄은 시스템이 장악한다.
  const line1 = scoreLine ? `${scoreLine} — ${lines[0] || ""}` : (lines[0] || "");

  document.getElementById("result").innerHTML = `
    <p><strong>${line1}</strong></p>
    <p>${lines[1] || ""}</p>
    <p style="color:red;">${lines[2] || ""}</p>
  `;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function calcScore(minutes, reason) {
  const m = Number(minutes) || 0;

  const timePenalty = m * 0.5;

  const reasonPenaltyMap = {
    "할 일을 피하려고": 20,
    "습관적으로": 10,
    "피곤해서": 15,
    "심심해서": 5
  };

  const reasonPenalty = reasonPenaltyMap[reason] ?? 10;

  const raw = 100 - timePenalty - reasonPenalty;
  return Math.round(clamp(raw, 0, 100));
}

function calcLevel(score) {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}


document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

renderHistory();

