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
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      dateISO: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
      date: new Date().toLocaleDateString("ko-KR"),
      screen,
      minutes,
      reason,
      intended,

      // baseScore(기본 점수)와 level은 네가 이미 계산 중인 값 사용
      baseScore: score,
      completed: false,

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
  items.unshift(item);

  const trimmed = items.slice(0, HISTORY_LIMIT);
  const recomputed = recomputeProgress(trimmed);

  saveHistory(recomputed);
  renderHistory();

  // 방금 저장한(최신) 기록을 선택 상태로 UI에 반영
  setSelectedRecord(recomputed[0]?.id);
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
      setSelectedRecord(picked.id);

      showResultText(picked.resultText, {
        score: picked.finalScore ?? picked.score,
        level: picked.level
      });
    });
  });

  const avgEl = document.getElementById("avgScore");
  if (avgEl) {
    const scores = loadHistory()
      .slice(0, HISTORY_SHOW)
      .map(x => Number(x.score))
      .filter(n => !Number.isNaN(n));

    if (scores.length === 0) {
      avgEl.innerText = "";
    } else {
      const avg = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      );
      avgEl.innerText = `최근 ${scores.length}회 평균 점수: ${avg}점`;
    }
  }


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

  const reasonPenaltyMap = {
    "할 일을 피하려고": 15,
    "습관적으로": 8,
    "피곤해서": 10,
    "심심해서": 5
  };
  const reasonPenalty = reasonPenaltyMap[reason] ?? 8;

  // 시간 패널티: 0~50 사이에서 완만하게 증가
  // m=0 -> 0, m=30 -> ~21, m=120 -> ~38, m=240 -> ~44
  const timePenalty = 50 * (1 - Math.exp(-m / 60));

  const raw = 100 - timePenalty - reasonPenalty;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function calcLevel(score) {
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}

function streakBonus(streak) {
  if (streak >= 3) return 10;
  if (streak === 2) return 8;
  if (streak === 1) return 5;
  return 0;
}

function daysBetween(aISO, bISO) {
  // aISO, bISO: "YYYY-MM-DD"
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  const ms = b - a;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// 기록 전체를 훑어서 streak/finalScore/level을 재계산
function recomputeProgress(history) {
  // 날짜 오름차순(과거 -> 현재)로 정렬해서 streak 계산
  const sorted = [...history].sort((x, y) => (x.dateISO || "").localeCompare(y.dateISO || ""));

  let streak = 0;
  let prevDate = null;

  for (const item of sorted) {
    // dateISO 없는 옛 기록은 streak 계산 제외(안전)
    if (!item.dateISO) {
      item.streak = 0;
      item.finalScore = item.baseScore ?? item.score ?? 0;
      item.level = calcLevel(item.finalScore);
      continue;
    }

    const isConsecutive =
      prevDate && daysBetween(prevDate, item.dateISO) === 1;

    if (item.completed) {
      streak = isConsecutive ? (streak + 1) : 1;
    } else {
      streak = 0;
    }

    item.streak = streak;

    const base = Number(item.baseScore ?? item.score ?? 0);
    const bonus = streakBonus(item.streak);
    item.finalScore = clamp(base + bonus, 0, 100);
    item.level = calcLevel(item.finalScore);

    prevDate = item.dateISO;
  }

  // 원래 배열(history)에 반영 (id로 매칭)
  const map = new Map(sorted.map(x => [x.id, x]));
  return history.map(x => map.get(x.id) || x);
}


document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
});

renderHistory();

let selectedRecordId = null;

function setSelectedRecord(id) {
  selectedRecordId = id;
  renderCompleteSection();
}

function renderCompleteSection() {
  const section = document.getElementById("completeSection");
  const check = document.getElementById("completeCheck");
  const info = document.getElementById("completeInfo");
  if (!section || !check || !info) return;

  const history = loadHistory();
  const rec = history.find(x => x.id === selectedRecordId);

  if (!rec) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  check.checked = !!rec.completed;

  const base = Number(rec.baseScore ?? rec.score ?? 0);
  const streak = Number(rec.streak ?? 0);
  const bonus = rec.completed ? streakBonus(streak) : 0;
  const finalScore = rec.completed ? rec.finalScore : base;

  info.innerText = rec.completed
    ? `완료 처리됨 · 스트릭 ${streak}일 · 보너스 +${bonus} · 최종 ${finalScore}점`
    : `미완료 · 완료 체크 시 보너스 적용 (스트릭에 따라 +5~+10)`;
}

document.getElementById("completeCheck")?.addEventListener("change", (e) => {
  const checked = e.target.checked;

  const history = loadHistory();
  const idx = history.findIndex(x => x.id === selectedRecordId);
  if (idx === -1) return;

  history[idx].completed = checked;

  const recomputed = recomputeProgress(history);
  saveHistory(recomputed);

  // 결과/기록/평균 다시 렌더
  renderHistory();

  // 현재 선택 기록 다시 표시(점수/레벨 갱신 반영)
  const rec = recomputed.find(x => x.id === selectedRecordId);
  if (rec) {
    showResultText(rec.resultText, { score: rec.finalScore, level: rec.level });
  }
  renderCompleteSection();
});
