/* 설정 탭: 프로필, 기기 이동·백업, 화면, 알림 */
"use strict";

Views.settings = function () {
  const st = S();
  const topics = st.profile.topics;
  $("#view-settings").innerHTML = `
    <div class="card"><h3>👤 프로필</h3>
      <div class="kv"><span>닉네임</span><b>${esc(st.profile.nickname) || "게스트"}</b></div>
      <div class="kv"><span>관심 토픽</span><b>${topics.length ? esc(topics.slice(0, 3).join(", ")) + (topics.length > 3 ? "…" : "") : "미설정"}</b></div>
      <button class="btn ghost block" id="set-profile">프로필 수정</button>
    </div>
    <div class="card"><h3>📲 기기·백업</h3>
      <p class="muted" style="font-size:13px;">이 앱은 서버 없이 이 기기에만 저장됩니다.</p>
      <div class="row">
        <button class="btn ghost small" id="set-transfer">모바일로 옮기기</button>
        <button class="btn ghost small" id="set-backup">백업 내보내기</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn ghost small" id="set-install">설치 안내 다시 보기</button>
      </div>
    </div>
    <div class="card"><h3>🎨 화면</h3>
      <div class="row">
        <button class="btn ghost small" id="set-theme">🌙 다크모드</button>
      </div>
    </div>
    <div class="card"><h3>🔔 세션 시작 알림</h3>
      <div class="row">
        <button class="btn ghost small" id="set-notify">${st.notify.on ? "🔕 알림 끄기" : "🔔 알림 켜기"}</button>
        <button class="btn ghost small" id="set-notify-min">${st.notify.minutes}분 전 ▾</button>
      </div>
      <p class="muted" style="font-size:12px;margin:6px 0 0;">앱이 켜져 있을 때 관심 세션 시작 전에 알려줘요.</p>
    </div>
    <div class="card"><h3>ℹ️ 앱 정보</h3>
      <div class="kv"><span>버전</span><b>re:Invent 2026 출장 v1</b></div>
      <div class="kv"><span>데이터 보관</span><b>이 기기(localStorage)</b></div>
    </div>`;

  $("#set-profile").onclick = Settings.editProfile;
  $("#set-transfer").onclick = () => TransferUI.showExport();
  $("#set-backup").onclick = () => TransferUI.exportFile();
  $("#set-install").onclick = () => { S().install_dismissed = false; maybeShowInstallGuide(); };
  $("#set-theme").onclick = () => {
    S().theme = S().theme === "dark" ? "light" : "dark";
    Store.save(); applyTheme(); Views.settings();
    toast(S().theme === "dark" ? "다크모드로 바꿨어요 🌙" : "라이트모드로 바꿨어요 ☀️");
  };
  $("#set-notify").onclick = async () => {
    if (S().notify.on) { Notify.disable(); }
    else {
      const minutes = Number(($("#set-notify-min") || {}).value) || 15;
      const ok = await Notify.enable(minutes);
      if (!ok) return;
    }
    Views.settings();
  };
  $("#set-notify-min").onclick = () => {
    const cur = S().notify.minutes;
    openModal(`
      <h2>알림 시점</h2>
      <p class="muted" style="font-size:13px;">세션 시작 몇 분 전에 알릴까요?</p>
      ${[5, 10, 15, 30].map((m) => `
        <button class="btn ${m === cur ? "" : "ghost"} block" data-min="${m}">${m}분 전${m === cur ? " ✓" : ""}</button>`).join("")}
      <button class="btn ghost block" id="min-cancel">취소</button>`);
    $$("#modal-root [data-min]").forEach((b) => b.onclick = () => {
      S().notify.minutes = Number(b.dataset.min);
      Store.save(); closeModal(); Views.settings();
    });
    $("#min-cancel").onclick = closeModal;
  };
  applyTheme();
};
