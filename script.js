// ===== 레벨업 2.0 MVP (V2) =====

// Storage keys (V2로 분리해서 기존 1.0 데이터와 충돌 방지)
const STATE_KEY = "levelup_state_v2";
const LOGS_KEY = "levelup_logs_v2";
const PROFILE_KEY = "levelup_profile_v1";

// Config
const SCORE_MIN = 0;
const SCORE_MAX = 1000;
const DAILY_XP_CAP = 120;
const MISSION_BONUS_XP = 10;

const HISTORY_SHOW_DAYS = 7;
const LOG_RETENTION_DAYS = 90;

// ----- Utilities -----
function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(iso, delta) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);

  // ⚠️ toISOString() 쓰면 UTC로 바뀌어서 한국에서 날짜가 하루 밀릴 수 있음
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeFloat(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function daysBetween(aISO, bISO) {
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

// ----- State / Logs -----
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (s && typeof s.score === "number") return s;
  } catch {}
  // default
  return {
    score: 300,
    level: levelFromScore(300),
    streak: 0,
    lastActiveISO: null,
    todayMission: null // { dateISO, text, completed, bonusXp }
  };
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOGS_KEY)) || [];
  } catch {
    return [];
  }
}

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null;
  } catch {
    return null;
  }
}
function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

function computeInitialScore(p) {
  // 기준점: 500, 생활지표로 가감 (0~1000)
  let score = 500;

  // BMI 기반(극단값 벌점, 정상범위 가점)
  const h = Number(p.heightCm) / 100;
  const w = Number(p.weightKg);
  if (h > 0 && w > 0) {
    const bmi = w / (h * h);
    if (bmi >= 18.5 && bmi <= 24.9) score += 60;
    else if (bmi >= 17 && bmi < 18.5) score += 20;
    else if (bmi > 24.9 && bmi <= 29.9) score += 10;
    else score -= 30; // 너무 마르거나 비만이면 감점
  }

  // 수면(7~8시간 최적)
  const sleep = Number(p.sleepHours);
  if (!Number.isNaN(sleep)) {
    if (sleep >= 7 && sleep <= 8) score += 70;
    else if (sleep >= 6 && sleep < 7) score += 40;
    else if (sleep >= 8 && sleep <= 9) score += 40;
    else if (sleep >= 5 && sleep < 6) score += 10;
    else score -= 40;
  }

  // 운동 빈도
  const ex = Number(p.exercisePerWeek);
  if (ex === 0) score -= 20;
  else if (ex === 1) score += 20;
  else if (ex === 3) score += 50;
  else if (ex === 5) score += 80;

  // 공부 시간
  const st = Number(p.studyHoursPerDay);
  if (st === 0) score -= 10;
  else if (st === 1) score += 20;
  else if (st === 3) score += 50;
  else if (st === 6) score += 80;

  // 나이(가벼운 보정: 너무 과하게 영향 주지 않음)
  const age = Number(p.age);
  if (!Number.isNaN(age) && age >= 10 && age <= 60) {
    // 20대 기준 ± 작은 보정
    score += clamp(20 - Math.abs(age - 22), -10, 20);
  }

  return clamp(Math.round(score), SCORE_MIN, SCORE_MAX);
}

function showProfileGate(show) {
  const gate = document.getElementById("profileGate");
  if (!gate) return;
  gate.style.display = show ? "block" : "none";
}

function resetProgressForNewProfile(state) {
  // 프로필 새로 저장 시, 진행 상태 초기화(혼란 방지)
  state.score = null;
  state.level = null;
  state.streak = 0;
  state.lastActiveISO = null;
  state.todayMission = null;
  saveState(state);

  // 로그도 초기화(주간 리포트/최근 기록 꼬임 방지)
  if (typeof saveLogs === "function") saveLogs([]);
}


function saveLogs(logs) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

function pruneLogs(logs) {
  const today = isoToday();
  return logs.filter(l => l?.dateISO && daysBetween(l.dateISO, today) <= LOG_RETENTION_DAYS);
}

// ----- Level mapping -----
function levelFromScore(score) {
  if (score >= 850) return "Diamond";
  if (score >= 700) return "Platinum";
  if (score >= 500) return "Gold";
  if (score >= 300) return "Silver";
  return "Bronze";
}

// ----- XP calculations -----
function calcRunXP(km, minutes) {
  const k = safeFloat(km);
  const m = safeFloat(minutes);
  if (k <= 0 || m <= 0) return 0;

  let xp = Math.round(10 * k);

  // pace bonus (minutes per km)
  const pace = m / k; // min/km
  let bonus = 0;
  if (pace <= 5.5) bonus = 10;
  else if (pace <= 6.5) bonus = 5;

  xp += bonus;

  // cap for run
  xp = Math.min(xp, 80);
  return Math.max(0, xp);
}

function calcStudyXP(sets) {
  const s = safeInt(sets);
  if (s <= 0) return 0;
  let xp = s * 8;
  xp = Math.min(xp, 80);
  return Math.max(0, xp);
}

function calcStreakBonus(streak) {
  if (streak >= 7) return 8;
  if (streak >= 3) return 5;
  if (streak >= 2) return 3;
  return 0;
}

function sumTodayXP(logs, dateISO) {
  return logs
    .filter(l => l.dateISO === dateISO)
    .reduce((a, l) => a + safeInt(l.xp), 0);
}

// ----- AI mission (serverless) -----
async function fetchMission(context) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error ? String(data.error) : "AI request failed";
    throw new Error(detail);
  }
  return data; // { missionText, weeklyComment }
}

// ----- UI helpers -----
function setActiveTab(tab) {
  const tabRun = document.getElementById("tabRun");
  const tabStudy = document.getElementById("tabStudy");
  const runForm = document.getElementById("runForm");
  const studyForm = document.getElementById("studyForm");

  if (tab === "run") {
    tabRun.classList.add("active");
    tabStudy.classList.remove("active");
    runForm.style.display = "block";
    studyForm.style.display = "none";
  } else {
    tabRun.classList.remove("active");
    tabStudy.classList.add("active");
    runForm.style.display = "none";
    studyForm.style.display = "block";
  }
}

function renderHeader() {
  const state = loadState();
  const scoreText = document.getElementById("scoreText");
  const levelText = document.getElementById("levelText");
  const streakText = document.getElementById("streakText");
  const todayHint = document.getElementById("todayHint");

  if (scoreText) scoreText.innerText = String(state.score);
  if (levelText) levelText.innerText = String(state.level);
  if (streakText) streakText.innerText = `${state.streak}일`;

  const today = isoToday();
  const logs = loadLogs();
  const todayXP = sumTodayXP(logs, today);

  const remainingXP = Math.max(0, DAILY_XP_CAP - todayXP);

  // ✅ 상단 힌트에 카운트다운 표시
  const countdown = formatTimeToMidnight();
  if (todayHint) {
    if (remainingXP <= 0) {
      todayHint.innerText = `오늘 획득 XP: ${todayXP} / ${DAILY_XP_CAP} (상한 도달 · 리셋까지 ${countdown})`;
    } else {
      todayHint.innerText = `오늘 획득 XP: ${todayXP} / ${DAILY_XP_CAP} (리셋까지 ${countdown})`;
    }
  }
}

let midnightTimer = null;
let _lastISOForReset = null;

function startMidnightCountdownTick() {
  if (midnightTimer) return;

  // 처음 기준 날짜 저장
  _lastISOForReset = isoToday();

  midnightTimer = setInterval(() => {
    // 프로필 게이트가 떠 있으면 굳이 갱신하지 않음
    const gate = document.getElementById("profileGate");
    if (gate && gate.style.display === "block") return;

    // ✅ 날짜 변경(00:00) 감지
    const nowISO = isoToday();
    if (_lastISOForReset && nowISO !== _lastISOForReset) {
      _lastISOForReset = nowISO;
      onMidnightResetUI();
    }

    // 헤더 카운트다운 갱신
    renderHeader();

    // 상한 버튼 UX 갱신
    if (typeof updateCapUX === "function") updateCapUX();
  }, 1000);
}

let resetBannerTimer = null;

function onMidnightResetUI() {
  // 1) 버튼 즉시 활성화
  const btn = document.getElementById("applyBtn");
  if (btn) {
    btn.disabled = false;
    btn.innerText = "XP 적용";
  }

  // 2) resetHint 숨김
  const resetHint = document.getElementById("resetHint");
  if (resetHint) {
    resetHint.style.display = "none";
    resetHint.innerText = "";
  }

  // 3) 배너 표시 (applyResult)
  const applyResult = document.getElementById("applyResult");
  if (applyResult) {
    applyResult.innerHTML = `
      <div class="ok" style="font-size:18px; font-weight:800;">
        XP 리셋됨
      </div>
      <div class="muted" style="margin-top:6px;">
        오늘 상한: ${DAILY_XP_CAP} XP
      </div>
    `;

    // ✅ 5초 후 배너 자동 제거
    if (resetBannerTimer) clearTimeout(resetBannerTimer);
    resetBannerTimer = setTimeout(() => {
      // 사용자가 그 사이에 다른 결과를 띄웠을 수 있으니 안전하게 "리셋됨" 배너일 때만 지움
      const html = applyResult.innerText || "";
      if (html.includes("XP 리셋됨")) {
        applyResult.innerHTML = "";
      }
    }, 5000);
  }

  // 4) 전체 갱신(오늘 XP 0, 주간 반영)
  renderAll();
}

function msUntilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // 내일 00:00:00.000
  return Math.max(0, next.getTime() - now.getTime());
}

function formatTimeToMidnight() {
  const ms = msUntilMidnight();
  const totalSec = Math.floor(ms / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}


function renderMission() {
  const state = loadState();
  const box = document.getElementById("missionBox");
  const btn = document.getElementById("missionDoneBtn");
  const status = document.getElementById("missionStatus");

  const today = isoToday();
  const m = state.todayMission;

  if (!m || m.dateISO !== today) {
    box.innerText = "아직 미션이 없다. 활동을 입력하면 생성된다.";
    btn.disabled = true;
    status.innerText = "";
    return;
  }

  box.innerText = `오늘 미션: ${m.text}`;
  if (m.completed) {
    btn.disabled = true;
    status.innerText = `완료됨 (+${m.bonusXp} XP 반영 완료)`;
  } else {
    btn.disabled = false;
    status.innerText = `미완료 (완료 체크 시 +${m.bonusXp} XP)`;
  }
}

function renderHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;

  const logs = loadLogs();
  const days = lastNDaysISO(HISTORY_SHOW_DAYS);
  const filtered = logs.filter(l => days.includes(l.dateISO));

  if (filtered.length === 0) {
    list.innerHTML = "<li>기록이 없다.</li>";
    return;
  }

  // recent first
  filtered.sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || ""));

  list.innerHTML = filtered
    .slice(0, 30)
    .map(l => {
      const typeLabel =
        l.type === "run" ? "러닝" :
        l.type === "study" ? "공부" :
        "미션";

      const inputLabel =
        l.type === "run"
          ? `${l.input.km}km · ${l.input.minutes}분`
          : l.type === "study"
            ? `${l.input.sets}세트`
            : `보너스`;


      const missionMark = l.mission?.completed ? " (미션✔)" : "";
      return `<li>
        <strong>${l.dateISO}</strong> · ${typeLabel} · ${inputLabel} · XP ${l.xp} · SCORE ${l.scoreBefore}→${l.scoreAfter}${missionMark}
      </li>`;
    })
    .join("");
}

function lastNDaysISO(n) {
  const today = isoToday();
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(addDays(today, -i));
  return arr;
}

function renderWeeklyReport() {
  const summary = document.getElementById("weeklySummary");
  const canvas = document.getElementById("weeklyChart");
  const weeklyAI = document.getElementById("weeklyAI");
  if (!summary || !canvas) return;

  const days = lastNDaysISO(7);
  const rawLogs = loadLogs();

  // --- dateISO 강제 정규화 ---
  function normalizeISODate(v, fallbackCreatedAt) {
    if (v != null) {
      let s = String(v).trim();

      // 1) 2026-01-06T... → 2026-01-06
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

      // 2) 2026. 1. 6. / 2026/1/6 / 2026년 1월 6일 등
      const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
      if (m) {
        const yyyy = m[1];
        const mm = String(m[2]).padStart(2, "0");
        const dd = String(m[3]).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }

      // 3) 2026/01/06 → 2026-01-06
      const m2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
      if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    }

    // 4) dateISO가 아예 없으면 createdAt(타임스탬프)로 생성
    if (Number.isFinite(fallbackCreatedAt)) {
      return new Date(fallbackCreatedAt).toISOString().slice(0, 10);
    }

    return null;
  }

  const normalized = (Array.isArray(rawLogs) ? rawLogs : [])
    .map(l => {
      const createdAt = Number(l?.createdAt ?? l?.ts ?? l?.created ?? NaN);
      const rawDate = l?.dateISO ?? l?.date ?? l?.iso ?? l?.day ?? null;
      const dateISO = normalizeISODate(rawDate, createdAt);

      return {
        ...l,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        dateISO
      };
    })
    .filter(l => typeof l.dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.dateISO));

  // --- byDay 만들기 (중요: normalized 사용) ---
  const byDay = new Map(days.map(d => [d, []]));
  for (const l of normalized) {
    if (byDay.has(l.dateISO)) byDay.get(l.dateISO).push(l);
  }

  // --- 일별 점수 계산 ---
  const dayScores = [];
  let totalXP = 0;
  let runXP = 0;
  let studyXP = 0;
  let missionDone = 0;
  let missionTotal = 0;

  for (const d of days) {
    const items = (byDay.get(d) || []).slice();
    items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    if (items.length === 0) {
      dayScores.push(null);
    } else {
      const last = items[items.length - 1];
      const s = Number(last?.scoreAfter);
      dayScores.push(Number.isFinite(s) ? s : null);
    }

    for (const it of items) {
      const xp = safeInt(it.xp);
      totalXP += xp;
      if (it.type === "run") runXP += xp;
      if (it.type === "study") studyXP += xp;

      if (it.mission) {
        missionTotal += 1;
        if (it.mission.completed) missionDone += 1;
      }
    }
  }

  // --- 요약 렌더 ---
  const missionRate = missionTotal ? Math.round((missionDone / missionTotal) * 100) : 0;
  summary.innerHTML = `
    <div class="pill">총 XP: ${totalXP}</div>
    <div class="pill">운동 XP: ${runXP}</div>
    <div class="pill">공부 XP: ${studyXP}</div>
    <div class="pill">미션 성공률: ${missionRate}%</div>
  `;

  // --- 디버그 로그 (지금 너 상황에서 필수) ---
  console.log("[weekly] days:", days);
  console.log("[weekly] normalized dateISO list:", normalized.map(x => x.dateISO));
  console.log("[weekly] dayScores:", dayScores);

  // --- 차트 그리기 ---
  drawWeeklyChart(canvas, days, dayScores);

  // weekly AI comment (없어도 차트는 반드시 그려지게)
  if (weeklyAI) {
    if (!weeklyAI.dataset.text) weeklyAI.innerText = "";
  }
}

function drawWeeklyChart(canvas, days, dayScores) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;

  // ✅ 캔버스가 실제로 그려지는지 확인용: 배경 초기화
  ctx.clearRect(0, 0, w, h);

  // 기본 폰트 지정(환경마다 기본값이 이상할 수 있어서 고정)
  ctx.font = "12px sans-serif";
  ctx.textBaseline = "alphabetic";

  const padL = 38, padR = 12, padT = 16, padB = 32;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // 축
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // 기록이 없으면 안내 문구라도 출력
  const hasAnyScore = dayScores.some(s => typeof s === "number" && Number.isFinite(s));
  if (!hasAnyScore) {
    ctx.fillText("최근 7일 기록이 없어 차트가 비어 있다.", padL, padT + 20);
    return;
  }

  // y 범위 고정
  const minY = 0, maxY = 1000;

  const n = days.length;
  const gap = 8;
  const barW = (plotW - gap * (n - 1)) / n;

  for (let i = 0; i < n; i++) {
    const x = padL + i * (barW + gap);
    const s = dayScores[i];

    // x축 라벨
    const label = days[i].slice(5);
    ctx.fillText(label, x, padT + plotH + 20);

    if (typeof s !== "number" || !Number.isFinite(s)) continue;

    // 막대 높이 계산
    const norm = (s - minY) / (maxY - minY);
    const bh = clamp(norm, 0, 1) * plotH;

    // ✅ 너무 얇아서 안 보이는 케이스 방지(점수>0이면 최소 1px은 그리기)
    const barH = (bh > 0 && bh < 1) ? 1 : bh;

    const y = padT + plotH - barH;
    ctx.fillRect(x, y, barW, barH);

    // 점수 텍스트
    ctx.fillText(String(s), x, y - 4);
  }

  ctx.fillText("주간 SCORE", padL, padT - 2);
}

// ----- Core actions -----
async function applyActivity(type) {
  const state = loadState();
  const logs = pruneLogs(loadLogs());
  const today = isoToday();

  // Determine streak
  let streak = state.streak || 0;
  const last = state.lastActiveISO;

  if (last === today) {
    // same day: keep streak
  } else if (last && daysBetween(last, today) === 1) {
    streak += 1;
  } else {
    streak = 1;
  }

  // Calculate XP
  let baseXP = 0;
  let input = null;

  if (type === "run") {
    const km = safeFloat(document.getElementById("runKm").value);
    const minutes = safeFloat(document.getElementById("runMin").value);
    if (km <= 0 || minutes <= 0) throw new Error("러닝 입력값이 올바르지 않다.");
    baseXP = calcRunXP(km, minutes);
    input = { km, minutes };
  } else {
    const sets = safeInt(document.getElementById("studySets").value);
    if (sets <= 0) throw new Error("공부 세트 입력값이 올바르지 않다.");
    baseXP = calcStudyXP(sets);
    input = { sets };
  }

  // apply caps
  const todaySoFar = sumTodayXP(logs, today);
  let xp = baseXP;

  // streak bonus included but still within cap
  const streakBonus = calcStreakBonus(streak);
  xp += streakBonus;

  // cap to daily remaining
  const remaining = Math.max(0, DAILY_XP_CAP - todaySoFar);
  xp = Math.min(xp, remaining);

  // ✅ XP가 0이면: 로그 저장/점수 반영/스트릭 갱신 모두 하지 않는다.
  if (xp <= 0) {
    const applyResult = document.getElementById("applyResult");
    if (applyResult) {
      applyResult.innerHTML = `
        <div class="danger"><strong>오늘은 XP 상한( ${DAILY_XP_CAP} )에 도달했다.</strong></div>
        <div class="muted">내일 다시 누적된다. (로그도 저장하지 않음)</div>
      `;
    }
    return;
  }

  const before = safeInt(state.score);
  const after = clamp(before + xp, SCORE_MIN, SCORE_MAX);

  // Create log entry
  const log = {
    id: newId(),
    createdAt: Date.now(),
    dateISO: today,
    type,
    input,
    xp,
    scoreBefore: before,
    scoreAfter: after,
    mission: null
  };

  logs.push(log);

  // Update state
  state.score = after;
  state.level = levelFromScore(after);
  state.streak = streak;
  state.lastActiveISO = today;

  // Generate mission if missing for today
  if (!state.todayMission || state.todayMission.dateISO !== today) {
    // Build a tiny context from last 7 days
    const recent = logs
      .filter(l => daysBetween(l.dateISO, today) <= 6)
      .slice(-20)
      .map(l => ({
        dateISO: l.dateISO,
        type: l.type,
        xp: l.xp,
        input: l.input
      }));

    try {
      const ai = await fetchMission({
        mode: "mission",
        todayISO: today,
        activityType: type,
        recent
      });

      const text = String(ai.missionText || "").trim();
      if (text) {
        state.todayMission = {
          dateISO: today,
          text,
          completed: false,
          bonusXp: MISSION_BONUS_XP
        };
      }
      const weekly = String(ai.weeklyComment || "").trim();
      if (weekly) {
        const weeklyAI = document.getElementById("weeklyAI");
        if (weeklyAI) {
          weeklyAI.dataset.text = weekly;
          weeklyAI.innerText = `AI 코멘트: ${weekly}`;
        }
      }
    } catch (e) {
      // AI 실패해도 앱은 진행
      state.todayMission = {
        dateISO: today,
        text: "오늘 미션: 10분 스트레칭(또는 정리) 후 완료 체크",
        completed: false,
        bonusXp: MISSION_BONUS_XP
      };
    }
  }

  // Attach mission snapshot to today's log (for history display)
  log.mission = state.todayMission
    ? { text: state.todayMission.text, completed: state.todayMission.completed, bonusXp: state.todayMission.bonusXp }
    : null;

  // Persist
  saveLogs(logs);
  saveState(state);

  // UI
  renderAll();

  // Apply result text
  const applyResult = document.getElementById("applyResult");
  if (applyResult) {
    const delta = after - before;
    const typeLabel = type === "run" ? "러닝" : "공부";
    applyResult.innerHTML = `
      <div><strong>${typeLabel} XP 적용 완료</strong></div>
      <div>획득 XP: <strong>${xp}</strong> (기본 ${baseXP}, 스트릭 보너스 ${streakBonus}, 일일 상한 반영)</div>
      <div>SCORE: <strong>${before} → ${after}</strong> (<span class="${delta >= 0 ? "ok" : "danger"}">${delta >= 0 ? "+" : ""}${delta}</span>)</div>
    `;
  }
}

function completeMission() {
  const state = loadState();
  const logs = pruneLogs(loadLogs());
  const today = isoToday();

  if (!state.todayMission || state.todayMission.dateISO !== today) {
    throw new Error("오늘 미션이 없다.");
  }
  if (state.todayMission.completed) {
    return; // already done
  }

  // Apply bonus XP (respect daily cap)
  const todaySoFar = sumTodayXP(logs, today);
  const remaining = Math.max(0, DAILY_XP_CAP - todaySoFar);
  const bonus = Math.min(state.todayMission.bonusXp, remaining);

  // ✅ 상한 때문에 보너스가 0이면: 완료는 처리하되 로그는 저장하지 않는다.
  if (bonus <= 0) {
    state.todayMission.completed = true;
    saveState(state);

    const status = document.getElementById("missionStatus");
    if (status) status.innerText = "완료 처리됨 (오늘 XP 상한이라 보너스는 0)";

    renderAll();
    return;
  }

  const before = safeInt(state.score);
  const after = clamp(before + bonus, SCORE_MIN, SCORE_MAX);


  // Update state
  state.score = after;
  state.level = levelFromScore(after);
  state.todayMission.completed = true;

  // ✅ 주간 로그 저장 (안전 버전: 없으면 스킵, 앱 안 죽음)
  try {
    if (typeof loadLogs === "function" && typeof saveLogs === "function") {
      const logs = loadLogs();

      // 아래 값들은 네 applyActivity 안에 실제로 존재하는 변수명으로 바꿔야 한다.
      // (일단 없으면 undefined로 들어가도 앱은 죽지 않는다)
      logs.unshift({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        dateISO: (typeof getTodayISO === "function")
          ? getTodayISO()
          : new Date().toISOString().slice(0, 10),
        ts: Date.now(),
        activityType: (typeof activityType !== "undefined") ? activityType : undefined,
        amount: (typeof amount !== "undefined") ? amount : undefined,
        xp: (typeof xp !== "undefined") ? xp : undefined,
        scoreAfter: (typeof state !== "undefined" && state && typeof state.score !== "undefined")
          ? state.score
          : undefined
      });

      saveLogs(logs);
    }
  } catch (e) {
    console.warn("log save skipped:", e);
  }


logs.push({
  id: newId(),
  createdAt: Date.now(),
  dateISO: today,
  type: "mission",
  input: { bonus: true },
  xp: bonus,
  scoreBefore: before,
  scoreAfter: after,
  mission: {
    text: state.todayMission.text,
    completed: true,
    bonusXp: state.todayMission.bonusXp
  }
});

  saveState(state);
  saveLogs(logs);

  renderAll();
}

function updateCapUX() {
  const btn = document.getElementById("applyBtn");
  const applyResult = document.getElementById("applyResult");
  const resetHint = document.getElementById("resetHint");

  const today = isoToday();
  const logs = loadLogs();
  const todayXP = sumTodayXP(logs, today);
  const remainingXP = Math.max(0, DAILY_XP_CAP - todayXP);

  const capped = remainingXP <= 0;

  // 버튼 UX
  if (btn) {
    btn.disabled = capped;
    btn.innerText = capped ? "오늘은 상한 도달" : "XP 적용";
  }

  // ✅ applyBtn 아래 회색 문구(고정)
  if (resetHint) {
    if (capped) {
      resetHint.style.display = "block";
      resetHint.innerText = `리셋까지 ${formatTimeToMidnight()} (내일 00:00)`;
    } else {
      resetHint.style.display = "none";
      resetHint.innerText = "";
    }
  }

  // ✅ 상한 도달 시 applyResult 큰 카운트다운 표시
  if (applyResult && capped) {
    applyResult.innerHTML = `
      <div class="danger"><strong>오늘 XP 상한( ${DAILY_XP_CAP} )에 도달했다.</strong></div>
      <div style="margin-top:6px; font-size:22px; font-weight:800;">
        리셋까지 ${formatTimeToMidnight()}
      </div>
      <div class="muted" style="margin-top:6px;">
        00:00에 자동으로 다시 활성화된다.
      </div>
    `;
  }
}

// ----- Render all -----
function renderAll() {
  renderHeader();
  renderMission();
  renderHistory();
  renderWeeklyReport();
  updateCapUX();
}

// ----- Event wiring -----
function init() {
  // Tabs
  document.getElementById("tabRun").addEventListener("click", () => setActiveTab("run"));
  document.getElementById("tabStudy").addEventListener("click", () => setActiveTab("study"));

  // Apply button
  document.getElementById("applyBtn").addEventListener("click", async () => {
    const btn = document.getElementById("applyBtn");
    const tabRunActive = document.getElementById("tabRun").classList.contains("active");
    const type = tabRunActive ? "run" : "study";

    try {
      btn.disabled = true;
      btn.innerText = "적용 중...";

      await applyActivity(type);
    } catch (e) {
      const applyResult = document.getElementById("applyResult");
      if (applyResult) {
        applyResult.innerHTML = `<div class="danger"><strong>에러:</strong> ${e.message || e}</div>`;
      }
    } finally {
      btn.disabled = false;
      btn.innerText = "XP 적용";
    }
  });

  // Mission done
  document.getElementById("missionDoneBtn").addEventListener("click", () => {
    try {
      completeMission();
    } catch (e) {
      const status = document.getElementById("missionStatus");
      if (status) status.innerText = `에러: ${e.message || e}`;
    }
  });

  // Reset
  document.getElementById("resetBtn").addEventListener("click", () => {
    const ok = confirm("정말 초기화할까? (모든 기록이 삭제됨)");
    if (!ok) return;
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(LOGS_KEY);
    localStorage.removeItem(PROFILE_KEY); // ✅ 프로필도 같이 초기화

    document.getElementById("applyResult").innerHTML = "";
    const weeklyAI = document.getElementById("weeklyAI");
    if (weeklyAI) {
      weeklyAI.dataset.text = "";
      weeklyAI.innerText = "";
    }

    // ✅ 프로필 다시 받게 만들기
    showProfileGate(true);
  });

  // ✅ 프로필 저장 버튼 (3번)
  document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
    const hint = document.getElementById("profileHint");
    if (hint) hint.innerText = "";

    const age = Number(document.getElementById("pAge")?.value);
    const sleepHours = Number(document.getElementById("pSleep")?.value);
    const heightCm = Number(document.getElementById("pHeight")?.value);
    const weightKg = Number(document.getElementById("pWeight")?.value);
    const exercisePerWeek = Number(document.getElementById("pExercise")?.value);
    const studyHoursPerDay = Number(document.getElementById("pStudy")?.value);

    if (!age || !sleepHours || !heightCm || !weightKg) {
      if (hint) hint.innerText = "나이/수면/키/몸무게는 필수다.";
      return;
    }

    const profile = { age, sleepHours, heightCm, weightKg, exercisePerWeek, studyHoursPerDay };
    saveProfile(profile);

    const state = loadState();
    resetProgressForNewProfile(state);

    const initial = computeInitialScore(profile);
    state.score = initial;
    state.level = levelFromScore(initial);
    state.streak = 0;
    state.lastActiveISO = null;
    saveState(state);

    showProfileGate(false);
    renderAll();
  });

  // Initial render (boot에서 처리)
}

// ✅ 앱 시작: 프로필 유무 체크 + 초기 점수 1회 세팅 + 렌더
(function boot() {
  init();
  const profile = loadProfile();
  const state = loadState();

  if (!profile) {
    showProfileGate(true);
    return;
  }

  if (state.score == null) {
    const initial = computeInitialScore(profile);
    state.score = initial;
    state.level = levelFromScore(initial);
    state.streak = 0;
    state.lastActiveISO = null;
    saveState(state);
  }

  showProfileGate(false);
  renderAll();

  // ✅ 카운트다운 1초 갱신 (헤더/버튼 UX만 가볍게 갱신)
  startMidnightCountdownTick();
})();

// Service worker register (있어도 되고 없어도 됨)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
