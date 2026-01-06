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

    const lines = text.split("\n").filter(l => l.trim() !== "");

    document.getElementById("result").innerHTML = `
      <p><strong>${lines[0] || ""}</strong></p>
      <p>${lines[1] || ""}</p>
      <p style="color:red;">${lines[2] || ""}</p>
    `;
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
