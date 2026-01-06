document.getElementById("submitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("submitBtn");

  // 1) 입력 검증 먼저 (여기서 return 해도 버튼 잠금 전이라 안전)
  const screen = document.getElementById("screen").value;
  const minutes = document.getElementById("minutes").value;
  const intended = document.getElementById("intended").value;
  const reasonEl = document.querySelector('input[name="reason"]:checked');

  if (!reasonEl) return alert("보기 시작한 이유를 선택해라.");
  if (!minutes || !intended) return alert("모든 입력을 채워라.");

  const reason = reasonEl.value;

  // 2) 여기서부터 잠금
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = "분석 중...";

  try {
    const text = await getAnalysis({ screen, minutes, reason, intended });
    // 결과 출력...
  } catch (e) {
    document.getElementById("result").innerText = "에러: " + (e.message || e);
  } finally {
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
