document.getElementById("submitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("submitBtn");

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

    // 연타 방지 시작 (검증 통과 후)
    btn.disabled = true;
    btn.innerText = "분석 중...";

    const text = await getAnalysis({ screen, minutes, reason, intended });

    const score = calcScore(minutes, reason);
    const level = calcLevel(score);

    showResultText(text, { score, level });

    addHistory({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      dateISO: new Date().toISOString().slice(0, 10),
      date: new Date().toLocaleDateString("ko-KR"),
      screen,
      minutes,
      reason,
      intended,
      baseScore: score,
      completed: false,
      resultText: text
    });

  } catch (e) {
    document.getElementById("result").innerText =
      "에러 발생: " + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.innerText = "레벨업 결과 보기";
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
  renderWeeklyReport();

  // 최신 기록을 선택 상태로
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
      const shownScore = it.finalScore ?? it.score ?? it.baseScore ?? "-";
      const title = `${it.date} · ${it.level || "-"} ${shownScore}점 · ${it.screen} ${it.minutes}분 · ${it.reason}`;
      return `<li style="margin:8px 0;">
        <button type="button" data-index="${idx}" class="historyItemBtn">${title}</button>
      </li>`;
    })
    .join("");

  document.querySelectorAll(".historyItemBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const index = Number(e.currentTarget.dataset.index);
      const picked = loadHistory()[index];
      if (!picked) return;

      setSelectedRecord(picked.id);
      showResultText(picked.resultText, {
        score: picked.finalScore ?? picked.score ?? picked.baseScore,
        level: picked.level
      });
    });
  });

  const avgEl = document.getElementById("avgScore");
  if (avgEl) {
    const scores = loadHistory()
      .slice(0, HISTORY_SHOW)
      .map(x => Number(x.finalScore ?? x.score ?? x.baseScore))
      .filter(n => !Number.isNaN(n));

    if (scores.length === 0) avgEl.innerText = "";
    else {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      avgEl.innerText = `최근 ${scores.length}회 평균 점수: ${avg}점`;
    }
  }
}


function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, delta) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}


function last7DaysISO() {
  const today = isoToday();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(today, -i));
  return days;
}

function groupByISO(history, days) {
  const map = new Map(days.map(d => [d, []]));
  for (const h of history) {
    if (!h.dateISO) continue;
    if (map.has(h.dateISO)) map.get(h.dateISO).push(h);
  }
  return map;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function mostCommon(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  let best = null, bestN = -1;
  for (const [k, n] of m.entries()) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}

function renderWeeklyReport() {
  const container = document.getElementById("weeklyReport");
  const canvas = document.getElementById("weeklyChart");
  if (!container || !canvas) return;

  const history = loadHistory();
  const days = last7DaysISO();
  const byDay = groupByISO(history, days);

  // 일별 대표 점수(그날 마지막 기록의 finalScore) + 총 사용시간
  const dayScores = [];
  const dayMinutes = [];

  let allItems = [];
  for (const d of days) {
    const items = byDay.get(d) || [];
    allItems = allItems.concat(items);

    if (items.length === 0) {
      dayScores.push(null);
      dayMinutes.push(0);
      continue;
    }

    // 기록은 최신이 앞(unshift)일 가능성이 높지만, 안전하게 dateISO 동일하므로 그냥 첫 번째를 "최신"으로 취급
    // 만약 동일 날짜 다건이면 최신 1건 기준
    const latest = items[0];
    const score = Number(latest.finalScore ?? latest.score ?? latest.baseScore);
    dayScores.push(Number.isFinite(score) ? score : null);

    const minutesSum = sum(items.map(x => Number(x.minutes) || 0));
    dayMinutes.push(minutesSum);
  }

  // 주간 요약
  const scoresForAvg = dayScores.filter(x => typeof x === "number");
  const avgScore = scoresForAvg.length ? Math.round(sum(scoresForAvg) / scoresForAvg.length) : null;

  const totalMinutes = sum(dayMinutes);
  const completedCount = allItems.filter(x => x.completed).length;
  const totalCount = allItems.length;
  const completionRate = totalCount ? Math.round((completedCount / totalCount) * 100) : null;

  const topScreen = mostCommon(allItems.map(x => x.screen).filter(Boolean));
  const topReason = mostCommon(allItems.map(x => x.reason).filter(Boolean));

  container.innerHTML = `
    <div style="background:#f5f5f5; padding:12px;">
      <div><strong>평균 점수:</strong> ${avgScore ?? "-"}점</div>
      <div><strong>총 낭비 시간:</strong> ${totalMinutes}분</div>
      <div><strong>완료율(제약 지킴):</strong> ${completionRate ?? "-"}%</div>
      <div><strong>가장 많이 본 화면:</strong> ${topScreen ?? "-"}</div>
      <div><strong>가장 흔한 이유:</strong> ${topReason ?? "-"}</div>
    </div>
  `;

  drawWeeklyChart(canvas, days, dayScores, dayMinutes);
}

function drawWeeklyChart(canvas, days, dayScores, dayMinutes) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // 여백
  const padL = 30, padR = 10, padT = 10, padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // 축 그리기
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // 점수(0~100)를 막대 높이로
  const n = days.length;
  const gap = 6;
  const barW = (plotW - gap * (n - 1)) / n;

  // 분(minutes)은 점수 막대 위에 작은 선으로 표시(스케일 따로)
  const maxMin = Math.max(1, ...dayMinutes);

  for (let i = 0; i < n; i++) {
    const x = padL + i * (barW + gap);

    // 점수 막대
    const score = dayScores[i];
    const scoreH = (typeof score === "number") ? (score / 100) * plotH : 0;
    const y = padT + plotH - scoreH;

    ctx.fillRect(x, y, barW, scoreH);

    // minutes marker (0~maxMin -> 0~plotH)
    const m = dayMinutes[i] || 0;
    const my = padT + plotH - (m / maxMin) * plotH;
    ctx.beginPath();
    ctx.moveTo(x, my);
    ctx.lineTo(x + barW, my);
    ctx.stroke();

    // 라벨(날짜의 MM-DD)
    const label = days[i].slice(5);
    ctx.fillText(label, x, padT + plotH + 20);
  }

  // 범례
  ctx.fillText("막대=점수, 선=분(상대)", padL, padT + 10);
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
renderWeeklyReport();

let selectedRecordId = null;

function setSelectedRecord(id) {
  selectedRecordId = id;
  renderCompleteSection();
  renderActionSection();

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
  renderWeeklyReport();
  setSelectedRecord(recomputed[0]?.id);
  // 현재 선택 기록 다시 표시(점수/레벨 갱신 반영)
  const rec = recomputed.find(x => x.id === selectedRecordId);
  if (rec) {
    showResultText(rec.resultText, { score: rec.finalScore, level: rec.level });
  }
  renderCompleteSection();
});


function extractConstraint(text) {
  const lines = String(text).split("\n").map(l => l.trim()).filter(Boolean);
  // "3."으로 시작하는 줄 찾기
  const line3 = lines.find(l => l.startsWith("3."));
  return line3 ? line3.replace(/^3\.\s*/, "") : (lines[2] || "");
}

const ACTION_KEY = "levelup_action_v1";
let timerInterval = null;

function renderActionSection() {
  const section = document.getElementById("actionSection");
  const actionTextEl = document.getElementById("actionText");
  const timerTextEl = document.getElementById("timerText");
  const startBtn = document.getElementById("startActionBtn");
  const stopBtn = document.getElementById("stopActionBtn");

  if (!section || !actionTextEl || !timerTextEl || !startBtn || !stopBtn) return;

  const history = loadHistory();
  const rec = history.find(x => x.id === selectedRecordId);
  if (!rec) {
    section.style.display = "none";
    return;
  }

  // 선택된 기록의 3번 제약 텍스트
  const constraint = extractConstraint(rec.resultText);
  actionTextEl.innerText = `제약: ${constraint}`;

  section.style.display = "block";

  const action = loadActionState();

  if (action && action.recordId === rec.id) {
    // 진행중
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    updateTimerText(action, timerTextEl);
    startTimerTick();
  } else {
    // 미진행
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    timerTextEl.innerText = "";
    stopTimerTick();
  }
}

function loadActionState() {
  try {
    return JSON.parse(localStorage.getItem(ACTION_KEY));
  } catch {
    return null;
  }
}
function saveActionState(obj) {
  localStorage.setItem(ACTION_KEY, JSON.stringify(obj));
}
function clearActionState() {
  localStorage.removeItem(ACTION_KEY);
}


function updateTimerText(action, el) {
  const now = Date.now();
  const remainingMs = action.endsAt - now;

  if (remainingMs <= 0) {
    el.innerText = "완료! 제약 달성.";
    onActionCompleted(action.recordId);
    return;
  }

  const totalSec = Math.floor(remainingMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  el.innerText = `남은 시간: ${mm}분 ${ss}초`;
}

function startTimerTick() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    const timerTextEl = document.getElementById("timerText");
    const action = loadActionState();
    if (!action || !timerTextEl) return stopTimerTick();
    updateTimerText(action, timerTextEl);
  }, 1000);
}

function stopTimerTick() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}


function onActionCompleted(recordId) {
  clearActionState();
  stopTimerTick();

  const history = loadHistory();
  const idx = history.findIndex(x => x.id === recordId);
  if (idx !== -1) {
    history[idx].completed = true;
    const recomputed = recomputeProgress(history);
    saveHistory(recomputed);

    const rec = recomputed.find(x => x.id === recordId);
    if (rec) {
      showResultText(rec.resultText, { score: rec.finalScore, level: rec.level });
      setSelectedRecord(rec.id);
    }
  }

  renderHistory();
  renderCompleteSection();
  renderActionSection();
}




document.getElementById("startActionBtn")?.addEventListener("click", () => {
  const history = loadHistory();
  const rec = history.find(x => x.id === selectedRecordId);
  if (!rec) return;

  const minutes = Number(document.getElementById("actionMinutes")?.value || 120);
  const durationMs = Math.max(10, Math.min(600, minutes)) * 60 * 1000;

  const action = {
    recordId: rec.id,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs
  };

  saveActionState(action);
  renderActionSection();
});

document.getElementById("stopActionBtn")?.addEventListener("click", () => {
  clearActionState();
  stopTimerTick();
  renderActionSection();
});
