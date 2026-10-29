/* 다른 기기와 이어하기: 보내기(공유 창·파일·텍스트 코드) + 받기(끌어다 놓기·파일·코드) → 미리보기 → 합치기·덮어쓰기 → 되돌리기
   서버 없음. 합치는 규칙은 js/sync.js */
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

/* 미리보기에 쓰는 컬렉션 이름 (없으면 키 이름 그대로) */
const SYNC_LABELS = {
  favorites: "관심 세션", daily_plan: "내 일정", reservations: "예약 상태", backups: "대체 세션", session_notes: "세션 메모",
  expenses: "지출", checklist: "준비물", depart_done: "출발 전 할 일", fixed_off: "고정 일정", fixed_edits: "고정 일정",
  peers: "동료 일정", news: "발표 메모", expo_booths: "Expo 부스", trip: "출장 정보", profile: "프로필", fx_rate: "환율", budget_usd: "예산"
};

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
    const text = JSON.stringify(env), name = this.fileName(new Date(now));
    const file = new File([text], name, { type: "application/json" });
    // Android Chrome·삼성 인터넷은 공유 창에 .json을 못 넘김 → 같은 내용의 .txt (받을 때 내용으로 읽음)
    const txt = new File([text], name.replace(/\.json$/, ".txt"), { type: "text/plain" });
    const code = await Sync.encodeCode(env);
    return { file, txt, code, photos, bytes };
  },
  undoInfo() {
    try { const u = JSON.parse(localStorage.getItem(this.UNDO_KEY) || "null"); return u && u.at ? { at: u.at } : null; } catch (e) { return null; }
  },
  /* 받은 파일(File) 또는 텍스트 코드 → Sync.parse 결과 */
  async read(src) {
    const obj = typeof src === "string" ? await Sync.decodeCode(src) : JSON.parse(await src.text());
    return Sync.parse(obj);
  },
  /* 합친 결과를 미리 계산 (반영 전 미리보기용) */
  plan(parsed) {
    const sl = S().sync_local || {};
    const sentOrGot = Math.max(sl.last_received_at || 0, sl.last_sent_at || 0);
    return Sync.merge(S(), parsed.data, { cfg: SYNC_CFG, lastReceivedAt: sl.last_received_at, lastSyncAt: sentOrGot || null,
      lastReceivedExportedAt: sl.last_received_exported_at, remoteExportedAt: parsed.exported_at });
  },
  /* 이 기기에 없고 합친 결과가 가리키는 사진 중 파일에 들어 있는 것 */
  async newPhotos(parsed, next) {
    const have = new Set(await Receipts.keys().catch(() => []));
    return this.photoIds(next).filter((id) => !have.has(id) && parsed.receipts[id]);
  },
  /* 반영 (스펙 6.2): 되돌리기 사본 → 안 쓰는 사진 정리 → 상태 교체 → 사진 저장 → 받음 기록 */
  async apply(parsed, mode) {
    const cur = S();
    const next = mode === "replace" ? Sync.replaceSynced(cur, parsed.data) : this.plan(parsed).state;
    try { localStorage.setItem(this.UNDO_KEY, JSON.stringify({ at: Date.now(), data: Sync.synced(cur) })); }
    catch (e) { toast("저장 공간이 부족해 되돌리기 사본을 만들지 못했어요"); }
    const keep = new Set(this.photoIds(cur).concat(this.photoIds(next)));
    for (const id of await Receipts.keys().catch(() => [])) if (!keep.has(id)) await Receipts.del(id);
    const add = await this.newPhotos(parsed, next);
    Store.replace(next);
    for (const id of add) {
      try { await Receipts.put(id, await (await fetch(parsed.receipts[id])).blob()); } catch (e) { /* 사진 하나 실패해도 나머지는 계속 */ }
    }
    const sl = S().sync_local;
    sl.last_received_at = Date.now();
    sl.last_received_exported_at = parsed.exported_at;
    sl.last_from = parsed.from;
    Store.save();
  },
  undo() {
    let u = null;
    try { u = JSON.parse(localStorage.getItem(this.UNDO_KEY) || "null"); } catch (e) { /* 무시 */ }
    if (!u || !u.data) { toast("되돌릴 가져오기가 없어요"); return; }
    const m = S().sync || {}, after = Object.values(m.stamps || {}).concat(Object.values(m.tombs || {})).filter((t) => t > u.at).length;
    if (after && !confirm(`가져온 뒤 이 기기에서 고친 ${after}건도 함께 사라져요. 되돌릴까요?`)) return;
    Store.replace(Sync.replaceSynced(S(), u.data));
    try { localStorage.removeItem(this.UNDO_KEY); } catch (e) { /* 무시 */ }
    const bar = $("#undo-bar");
    if (bar) bar.remove();
    if (Views[currentTab]) Views[currentTab]();
    toast("가져오기 전으로 되돌렸어요");
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
      if (sh) sh.textContent = on ? (this.shareable(prepared) ? "📤 공유하기로 보내기" : "📤 파일 저장하고 보내기") : "준비 중…";
      if (on && !this.shareable(prepared) && browserEnv().os !== "desktop") $("#sd-hint").textContent = "이 브라우저는 공유 창으로 파일을 못 보내요. 저장한 파일을 카톡·AirDrop으로 보내세요";
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
      const f = this.shareable(p);
      if (f) {
        navigator.share({ files: [f], title: "re:Invent 출장 앱 데이터" })
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
  /* 공유 창에 넘길 수 있는 파일 (.json 우선, 안 되면 .txt), 둘 다 안 되면 null */
  shareable(p) { return this.canShareFile(p.file) ? p.file : p.txt && this.canShareFile(p.txt) ? p.txt : null; },
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

  showReceive(onDone) {
    this._onDone = onDone || null;
    const desktop = browserEnv().os === "desktop";
    openSheet({
      title: "📥 다른 기기에서 받기",
      body: `
        <div class="rv-drop" id="rv-drop">
          <div class="rv-ico" aria-hidden="true">📂</div>
          <b>${desktop ? "여기에 파일을 끌어다 놓으세요" : "받은 파일을 골라 주세요"}</b>
          <label class="btn" style="cursor:pointer;">파일 선택<input type="file" id="rv-file" accept=".json,application/json,.txt,text/plain" style="display:none;"></label>
        </div>
        <p class="muted" style="font-size:12px;margin:6px 0 0;">AirDrop·카톡으로 받은 파일은 ${desktop ? "다운로드 폴더" : "파일 앱 → 다운로드"}에 있어요. 바로 합치지 않고 무엇이 바뀌는지 먼저 보여드려요.</p>
        <label class="field" style="display:block;margin-top:14px;">또는 텍스트 코드 붙여넣기</label>
        <textarea id="rv-code" rows="3" placeholder="z1.으로 시작하는 코드"></textarea>
        <button class="btn ghost block" id="rv-code-go">코드로 가져오기</button>`
    });
    $("#rv-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) this.receiveFrom(f); });
    $("#rv-code-go").onclick = () => {
      const t = $("#rv-code").value.trim();
      if (!t) { toast("코드를 붙여넣어 주세요"); return; }
      this.receiveFrom(t);
    };
  },
  async receiveFrom(src) {
    let parsed;
    try { parsed = await Transfer.read(src); }
    catch (e) {
      toast(e && e.message === "no-gzip" ? "이 브라우저에서는 이 코드를 풀 수 없어요. 파일로 보내 주세요"
        : typeof src === "string" ? "코드를 읽을 수 없어요. 다시 확인해 주세요." : "re:Invent 앱 파일이 아니에요");
      return;
    }
    this.showPreview(parsed);
  },
  /* 컬렉션별 "내 일정 +2", "지출 +1 · 변경 1" (같은 이름은 합침) */
  rowsText(rows) {
    const byLabel = new Map();
    Object.keys(rows).forEach((col) => {
      const label = SYNC_LABELS[col] || col, r = rows[col], t = byLabel.get(label) || { add: 0, change: 0, del: 0 };
      t.add += r.add; t.change += r.change; t.del += r.del;
      byLabel.set(label, t);
    });
    return Array.from(byLabel).map(([label, r]) =>
      [label, [r.add ? `+${r.add}` : "", r.change ? `변경 ${r.change}` : "", r.del ? `삭제 ${r.del}` : ""].filter(Boolean).join(" · ")])
      .filter(([, t]) => t);
  },
  async showPreview(parsed) {
    const { state, summary } = Transfer.plan(parsed);
    const photos = (await Transfer.newPhotos(parsed, state)).length;
    const lines = this.rowsText(summary.rows);
    if (photos) lines.push(["영수증 사진", `+${photos}`]);
    const notes = [];
    if (summary.overwritten) notes.push(`<div class="warn-box">⚠️ 이 기기에서 고친 것 중 ${summary.overwritten}건은 다른 기기에서 나중에 고쳐서 그쪽으로 바뀌어요.</div>`);
    if (summary.legacyOverwritten) notes.push(`<div class="warn-box">⚠️ 기록이 없는 예전 항목 ${summary.legacyOverwritten}건은 가져온 값으로 바뀌어요. 이 기기 값을 지키려면 취소하고, 이 기기에서 먼저 보내 주세요.</div>`);
    if (summary.stale) notes.push(`<div class="notice">이전에 보낸 파일이에요. 합쳐도 최신 내용은 그대로 남아요.</div>`);
    if (summary.legacy) notes.push(`<div class="notice">처음 합칠 때는 예전에 지운 항목이 다시 생길 수 있어요.</div>`);
    const title = parsed.from && parsed.exported_at ? `📥 ${parsed.from}에서 ${Transfer.when(parsed.exported_at)}에 보낸 데이터` : "📥 가져온 데이터";
    openSheet({
      title,
      body: `
        <ul class="mg-rows" id="mg-rows">${lines.length ? lines.map(([l, t]) => `<li>${esc(l)} <b>${esc(t)}</b></li>`).join("")
          : `<li class="muted">이미 같은 상태예요</li>`}</ul>
        ${notes.join("")}
        <p class="muted" style="font-size:12px;margin:8px 0 0;">합치기: 두 기기 내용을 모두 남기고, 같은 항목은 나중에 고친 쪽으로 맞춰요. 테마·글자 크기 같은 이 기기 설정은 그대로예요.</p>`,
      actions: `<button class="btn ghost" id="mg-cancel">취소</button><button class="btn ghost" id="mg-over">덮어쓰기</button><button class="btn" id="mg-merge">합치기</button>`,
      sticky: true
    });
    $("#mg-cancel").onclick = () => $("#modal-overlay")._dismiss();
    $("#mg-merge").onclick = () => this.commit(parsed, "merge");
    $("#mg-over").onclick = () => {
      const lost = Sync.lost(S(), parsed.data, SYNC_CFG), byLabel = new Map();
      Object.keys(lost).forEach((c) => { const l = SYNC_LABELS[c] || c; byLabel.set(l, (byLabel.get(l) || 0) + lost[c]); });
      const words = Array.from(byLabel).map(([l, n]) => `${l} ${n}${l === "지출" ? "건" : "개"}`).join(", ");
      if (!confirm(words ? `이 기기에만 있는 항목이 사라져요: ${words}. 덮어쓸까요?` : "이 기기의 데이터를 가져온 데이터로 바꿀까요?")) return;
      this.commit(parsed, "replace");
    };
  },
  async commit(parsed, mode) {
    $$("#modal-overlay .bs-actions .btn").forEach((b) => { b.disabled = true; });
    try { await Transfer.apply(parsed, mode); }
    catch (e) { toast("가져오지 못했어요"); $$("#modal-overlay .bs-actions .btn").forEach((b) => { b.disabled = false; }); return; }
    closeModal();
    const done = this._onDone;
    this._onDone = null;
    if (done) done(); else if (Views[currentTab]) Views[currentTab]();
    this.showUndoBar(mode === "replace" ? "덮어썼어요" : "합쳤어요");
  },
  showUndoBar(msg) {
    const old = $("#undo-bar");
    if (old) old.remove();
    const bar = document.createElement("div");
    bar.id = "undo-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = `<span>${esc(msg)}</span><button class="btn small" id="undo-go">되돌리기</button>`;
    document.body.appendChild(bar);
    $("#undo-go").onclick = () => Transfer.undo();
    clearTimeout(this._undoT);
    this._undoT = setTimeout(() => bar.remove(), 12000);
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

/* 받기 화면이 열려 있는 동안 창 아무 데나 파일을 놓아도 받음 */
document.addEventListener("dragover", (e) => {
  const z = $("#rv-drop");
  if (!z) return;
  e.preventDefault();
  z.classList.add("over");
});
document.addEventListener("dragleave", (e) => { const z = $("#rv-drop"); if (z && !e.relatedTarget) z.classList.remove("over"); });
document.addEventListener("drop", (e) => {
  const z = $("#rv-drop");
  if (!z) return;
  e.preventDefault();
  z.classList.remove("over");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) TransferUI.receiveFrom(f);
});
