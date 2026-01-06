document.getElementById("submitBtn").addEventListener("click", async () => {
  const screen = document.getElementById("screen").value;
  const minutes = document.getElementById("minutes").value;
  const intended = document.getElementById("intended").value;

  const reasonEl = document.querySelector('input[name="reason"]:checked');
  if (!reasonEl) {
    alert("보기 시작한 이유를 선택해라.");
    return;
  }
  const reason = reasonEl.value;
  if (!screen) {
    alert("가장 오래 본 화면을 선택해라.");
    return;
  }
  if (!minutes || !intended) {
    alert("모든 입력을 채워라.");
    return;
  }

  document.getElementById("result").innerText = "분석 중...";

  try {
    const text = await getAnalysis({ screen, minutes, reason, intended });

    const lines = text.split("\n").filter(line => line.trim() !== "");

    document.getElementById("result").innerHTML = `
      <p><strong>${lines[0] || ""}</strong></p>
      <p>${lines[1] || ""}</p>
      <p style="color:red;">${lines[2] || ""}</p>
    `;
  } catch (e) {
    document.getElementById("result").innerText = "에러 발생: " + (e?.message || e);
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
    // 서버가 준 에러를 그대로 던진다
    throw new Error(result.error || JSON.stringify(result));
  }

  return result.result;
}
