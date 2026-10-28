/* 다른 기기와 이어하기: 보내기(공유 창·파일·텍스트 코드) + 받기 (서버 없음). 합치는 규칙은 js/sync.js */
"use strict";

/* 보낸 기기 이름: "iPhone · Safari", "Galaxy · 삼성 인터넷", "Mac · Chrome", 홈 화면 앱이면 "iPhone · 앱" */
function deviceLabel() {
  const env = browserEnv(), ua = navigator.userAgent || "";
  const dev = env.os === "ios" ? (/iPad|Macintosh/.test(ua) ? "iPad" : "iPhone")
    : env.os === "android" ? (/SamsungBrowser|SM-/.test(ua) ? "Galaxy" : "Android")
    : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "PC";
  const br = { safari: "Safari", chrome: "Chrome", samsung: "삼성 인터넷", edge: "Edge", whale: "Whale", firefox: "Firefox" }[env.browser] || "브라우저";
  return `${dev} · ${isStandalone() ? "앱" : br}`;
}

const blobToDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

const Transfer = {
  UNDO_KEY: "reinvent2026.undo",
  /* "10/28 15:30" (이 기기 시각) */
  when(ms) {
    const d = new Date(ms);
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  },
  fileName(now) {
    const d = now || new Date();
    return `reinvent2026-이어하기-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}.json`;
  },
  /* 지출이 가리키는 영수증 사진 번호 */
  photoIds(state) { return Array.from(new Set(((state || S()).expenses || []).map((e) => e.receipt_img).filter(Boolean))); },
  async photoStats() {
    let count = 0, bytes = 0;
    for (const id of this.photoIds()) {
      const blob = await Receipts.get(id).catch(() => null);
      if (blob) { count++; bytes += Math.ceil(blob.size * 4 / 3); } // data URL로 넣으면 1.33배
    }
    return { count, bytes };
  },
  /* 보낼 파일과 텍스트 코드를 미리 만듦 — iOS는 클릭 직후에만 공유 창을 허락해서 클릭 전에 끝내 둔다 */
  async prepare(withPhotos) {
    const now = Date.now();
    const receipts = {};
    let photos = 0, bytes = 0;
    if (withPhotos) {
      for (const id of this.photoIds()) {
        const blob = await Receipts.get(id).catch(() => null);
        if (!blob) continue;
        receipts[id] = await blobToDataURL(blob);
        photos++; bytes += receipts[id].length;
      }
    }
    const env = Sync.envelope({ data: JSON.parse(JSON.stringify(Sync.synced(S()))), exported_at: now, from: deviceLabel(), receipts });
    const file = new File([JSON.stringify(env)], this.fileName(new Date(now)), { type: "application/json" });
    const code = await Sync.encodeCode(env);
    return { file, code, photos, bytes };
  },
  undoInfo() {
    try { const u = JSON.parse(localStorage.getItem(this.UNDO_KEY) || "null"); return u && u.at ? { at: u.at } : null; } catch (e) { return null; }
  },
  /* 예전 코드 읽기 — 받기 화면을 바꾸면서 Sync.decodeCode로 대체 */
  decode(code) {
    let b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || !obj.profile) throw new Error("invalid");
    return obj;
  }
};

const TransferUI = {
  mb(bytes) { return `약 ${Math.max(0.1, bytes / 1048576).toFixed(1)}MB`; },
  hint() {
    const os = browserEnv().os;
    return os === "ios" ? "공유 창에서 AirDrop → 내 Mac을 고르세요"
      : os === "android" ? "공유 창에서 카카오톡 → 나와의 채팅을 고르세요"
      : "저장한 파일을 AirDrop·카톡으로 폰에 보내세요";
  },
  showSend() {
    const nPhotos = Transfer.photoIds().length;
    openSheet({
      title: "📤 다른 기기로 보내기",
      body: `
        <p class="muted" style="font-size:13px;margin-top:0;">받는 기기에서 <b>📥 받기</b>를 누르면 두 기기의 내용이 합쳐져요.</p>
        <label class="check-item"><input type="checkbox" id="sd-photos"${nPhotos ? " checked" : " disabled"}>
          <span>영수증 사진 포함 <span class="muted" id="sd-photo-info">${nPhotos ? `(${nPhotos}장)` : "(사진 없음)"}</span></span></label>
        <button class="btn accent block" id="sd-share" disabled>준비 중…</button>
        <p class="muted sd-hint" id="sd-hint">${esc(this.hint())}</p>
        <div class="row" style="margin-top:4px;">
          <button class="btn ghost small" id="sd-save" disabled>💾 파일로 저장</button>
          <button class="btn ghost small" id="sd-code" disabled>📋 텍스트 코드 복사</button>
        </div>
        <p class="muted" style="font-size:12px;margin:6px 0 0;">텍스트 코드는 파일을 못 보낼 때 카톡 메시지로 붙여넣는 용도예요. 사진은 파일로 보내야 함께 옮겨져요.</p>
        <textarea id="sd-code-text" rows="3" readonly hidden></textarea>
        <div class="notice">⚠️ 이 파일·코드에는 내 일정·지출이 들어 있어요. 다른 사람에게 보내지 마세요.</div>`
    });
    let prepared = null, token = 0;
    const btns = ["#sd-share", "#sd-save", "#sd-code"];
    const ready = (on) => {
      btns.forEach((s) => { const b = $(s); if (b) b.disabled = !on; });
      const sh = $("#sd-share");
      if (sh) sh.textContent = on ? (this.canShareFile(prepared.file) ? "📤 공유하기로 보내기" : "📤 파일 저장하고 보내기") : "준비 중…";
    };
    const prepare = async () => {
      const my = ++token;
      prepared = null; ready(false);
      const withPhotos = $("#sd-photos").checked;
      try {
        const p = await Transfer.prepare(withPhotos);
        if (my !== token || !$("#sd-share")) return; // 그새 다시 준비했거나 닫힘
        prepared = p; ready(true);
        if (withPhotos && p.photos) $("#sd-photo-info").textContent = `(${p.photos}장 · ${this.mb(p.bytes)})`;
      } catch (e) { if (my === token) toast("보낼 파일을 만들지 못했어요"); }
    };
    $("#sd-photos").onchange = prepare;
    // 클릭 직후 바로 공유 창 (기다리는 작업 없음)
    $("#sd-share").onclick = () => {
      const p = prepared;
      if (!p) return;
      if (this.canShareFile(p.file)) {
        navigator.share({ files: [p.file], title: "re:Invent 출장 앱 데이터" })
          .then(() => this.sent())
          .catch((e) => { if (!e || e.name !== "AbortError") this.saveFile(p.file); });
      } else this.saveFile(p.file);
    };
    $("#sd-save").onclick = () => { if (prepared) this.saveFile(prepared.file); };
    $("#sd-code").onclick = async () => {
      const p = prepared;
      if (!p) return;
      try { await navigator.clipboard.writeText(p.code); }
      catch (e) { const ta = $("#sd-code-text"); ta.hidden = false; ta.value = p.code; ta.select(); document.execCommand("copy"); }
      this.sent();
      toast("코드를 복사했어요 (사진 제외)");
    };
    prepare();
  },
  canShareFile(file) {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; }
  },
  saveFile(file) {
    download(file.name, file, "application/json");
    this.sent();
    toast("다운로드 폴더에 저장했어요. AirDrop·카톡으로 보내세요");
  },
  /* 설정 카드 상태 줄: "마지막으로 보냄 10/28 15:30 · 받음 10/28 09:10 (iPhone · Safari)" */
  syncStatus(st) {
    const l = (st || S()).sync_local || {}, parts = [];
    if (l.last_sent_at) parts.push(`마지막으로 보냄 ${Transfer.when(l.last_sent_at)}`);
    if (l.last_received_at) parts.push(`받음 ${Transfer.when(l.last_received_at)}${l.last_from ? ` (${l.last_from})` : ""}`);
    return parts.length ? parts.join(" · ") : "아직 주고받은 적 없어요";
  },
  /* 보냄 기록 (설정의 '마지막으로 보냄'·'마지막 백업') */
  sent() {
    S().sync_local.last_sent_at = Date.now();
    this.markBackup();
  },

  showImport(onDone, onCancel) {
    openModal(`
      <h2>📥 다른 기기에서 가져오기</h2>
      <p class="muted" style="font-size:13px;">이전 기기에서 복사한 코드를 붙여넣거나, 백업 파일을 선택하세요.</p>
      <textarea id="tf-in" rows="5" placeholder="여기에 코드를 붙여넣으세요"></textarea>
      <button class="btn block" id="tf-do">가져오기</button>
      <div class="row" style="margin-top:8px;">
        <label class="btn ghost" style="cursor:pointer;">백업 파일 선택<input type="file" id="tf-filein" accept=".json,application/json" style="display:none;"></label>
        <button class="btn ghost" id="tf-cancel">취소</button>
      </div>`, { sticky: true });
    const apply = (obj) => {
      if (!obj || typeof obj !== "object" || !obj.profile) { toast("앱 백업 데이터가 아니에요."); return; }
      if (!confirm("현재 기기의 데이터가 가져온 데이터로 교체됩니다. 계속할까요?")) return;
      Store.state = Object.assign(defaultState(), obj, { onboarded: true });
      Store.save();
      closeModal();
      applyTheme();
      Notify.start();
      toast("가져오기를 완료했어요 🎉");
      if (onDone) onDone(); else switchTab("home");
    };
    $("#tf-do").onclick = () => {
      try { apply(Transfer.decode($("#tf-in").value)); }
      catch (e) { toast("코드를 읽을 수 없어요. 다시 확인해 주세요."); }
    };
    $("#tf-filein").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { apply(JSON.parse(r.result)); } catch (err) { toast("파일을 읽을 수 없어요."); } };
      r.readAsText(f);
    });
    $("#tf-cancel").onclick = () => { closeModal(); if (onCancel) onCancel(); };
  },

  /* 백업 파일 저장: 보내기와 같은 파일(사진 포함)을 이 기기에 다운로드 */
  async exportFile() {
    try {
      const p = await Transfer.prepare(true);
      download(p.file.name, p.file, "application/json");
      this.markBackup();
      toast("백업 파일을 저장했어요");
    } catch (e) { toast("백업 파일을 만들지 못했어요"); }
  },

  /* 백업 시각 기록 → 설정의 '마지막 백업'·홈의 백업 알림에 반영 */
  markBackup() {
    S().last_backup_at = Date.now();
    Store.save();
    if (currentTab === "settings") Views.settings();
    else if (currentTab === "home" && !$("#modal-overlay")) Views.home();
  }
};
