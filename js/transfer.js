/* 기기 옮기기: 코드 복사/붙여넣기 + 백업 파일 (서버 없음) */
"use strict";

/* 옮길 데이터: 날씨 캐시처럼 다시 받을 수 있는 값은 빼서 코드를 짧게 */
function portableState() {
  const o = Object.assign({}, S());
  delete o.weather_cache;
  return o;
}

const Transfer = {
  encode() {
    const json = JSON.stringify(portableState());
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
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
  showExport() {
    const code = Transfer.encode();
    openModal(`
      <h2>📤 다른 기기로 옮기기</h2>
      <p class="muted" style="font-size:13px;">아래 코드를 복사해서 다른 기기 앱의 <strong>설정 → 가져오기</strong>(처음 실행이라면 '다른 기기에서 가져오기')에 붙여넣으세요.
      코드는 ${Math.round(code.length / 1024 * 10) / 10}KB 입니다.</p>
      <textarea id="tf-code" rows="5" readonly>${esc(code)}</textarea>
      <div class="row">
        <button class="btn" id="tf-copy">코드 복사</button>
        <button class="btn ghost" id="tf-share">공유하기</button>
      </div>
      <button class="btn ghost block" id="tf-file">백업 파일로 저장</button>
      <div class="notice">⚠️ 이 코드에는 내 일정·지출 등이 들어 있어요. 다른 사람에게 노출되지 않게 주의하세요.</div>
      <button class="btn ghost block" id="tf-close">닫기</button>`);
    $("#tf-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(code); toast("코드를 복사했어요"); }
      catch (e) { $("#tf-code").select(); document.execCommand("copy"); toast("코드를 복사했어요"); }
    };
    $("#tf-share").onclick = async () => {
      if (navigator.share) {
        try { await navigator.share({ title: "re:Invent 출장 앱 데이터", text: code }); } catch (e) { /* 취소 */ }
      } else toast("이 기기에서는 공유하기를 지원하지 않아요. 코드 복사를 이용하세요.");
    };
    $("#tf-file").onclick = () => this.exportFile();
    $("#tf-close").onclick = closeModal;
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

  exportFile() {
    download(`reinvent2026-backup-${vegasDateStr()}.json`, JSON.stringify(portableState()), "application/json");
    toast("백업 파일을 저장했어요");
  }
};
