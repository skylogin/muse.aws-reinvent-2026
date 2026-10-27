/* 📝 노트 허브: 세션 노트 · 발표 노트 · 부스 스탬프를 한 시트에서 */
"use strict";

/* 세션 노트: 별점·메모를 남긴 세션 목록 + 텍스트 내보내기 */
const SessionNotes = {
  items() {
    const notes = S().session_notes || {};
    return Object.keys(notes)
      .filter((id) => notes[id] && (notes[id].rating || notes[id].memo))
      .map((id) => ({ id, ...notes[id], s: allSessions().find((x) => x.session_id === id) }))
      .sort((a, b) => String((a.s || {}).date || "") + String((a.s || {}).start_time || "") > String((b.s || {}).date || "") + String((b.s || {}).start_time || "") ? 1 : -1);
  },
  stars(r) { return r ? "★".repeat(r) + "☆".repeat(5 - r) : "☆☆☆☆☆"; },
  bodyHTML() {
    const list = this.items();
    if (!list.length) return `<p class="muted">아직 남긴 노트가 없어요. 세션 상세에서 별점과 메모를 남겨 보세요.</p>`;
    return list.map((x) => `
      <div class="sg-row" data-note-open="${esc(x.id)}" role="button" tabindex="0">
        <div class="sg-main"><b>${esc((x.s || {}).title || x.id)}</b>
          <span class="muted">${x.s && x.s.date ? esc(dayLabel(x.s.date)) + " " + esc(x.s.start_time || "") : ""}${x.s && x.s.venue ? " · " + esc(x.s.venue) : ""}</span>
          ${x.memo ? `<span style="display:block;font-size:13px;margin-top:2px;">${esc(x.memo.length > 80 ? x.memo.slice(0, 80) + "…" : x.memo)}</span>` : ""}
        </div>
        <div class="sg-act"><span style="color:var(--accent);font-size:14px;white-space:nowrap;">${this.stars(x.rating)}</span></div>
      </div>`).join("");
  },
  bind(root) {
    $$("[data-note-open]", root).forEach((el) => {
      el.onclick = () => { closeModal(); Sessions.openDetail(el.dataset.noteOpen); };
    });
  },
  exportTxt() {
    const list = this.items();
    if (!list.length) { toast("내보낼 노트가 없어요"); return; }
    const lines = ["re:Invent 2026 세션 노트", "=".repeat(28), ""];
    list.forEach((x) => {
      const s = x.s || {};
      lines.push(`■ ${s.title || x.id}`);
      if (s.date || s.start_time) lines.push(`  ${s.date ? dayLabel(s.date) : ""} ${s.start_time || ""}${s.end_time ? "–" + s.end_time : ""}${s.venue ? " · " + s.venue : ""}`);
      if (x.rating) lines.push(`  별점: ${"★".repeat(x.rating)}${"☆".repeat(5 - x.rating)}`);
      if (x.memo) lines.push(`  메모: ${x.memo}`);
      lines.push("");
    });
    download("reinvent2026-session-notes.txt", lines.join("\n"), "text/plain;charset=utf-8");
    toast("노트를 저장했어요 📄");
  }
};

/* 신규 발표 노트: 키노트·발표 내용을 적어 두면 관련 세션을 찾아 줌
   데이터: event_info.announcements = [{ date, title, q }] (q: 검색어, 쉼표로 여러 개) + 내가 적은 메모 */
const News = {
  items() {
    const fromData = ((window.APP_DATA.event_info || {}).announcements || [])
      .filter((x) => x && x.title).map((x, i) => ({ id: "an-" + i, title: x.title, q: x.q || (x.services || []).join(",") || x.title, date: x.date, official: true }));
    return fromData.concat((S().news || []).map((x) => ({ ...x, official: false })));
  },
  terms(q) { return String(q || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean); },
  related(q) {
    const terms = this.terms(q);
    if (!terms.length) return [];
    return sessionIndex().filter(({ hay }) => terms.some((t) => hay.includes(t))).map((x) => x.s);
  },
  /* 관련 세션 보기: 세션 탭 검색으로 연결 (첫 검색어 기준) */
  show(q) {
    closeModal();
    Sessions.q = String(q || "").split(",").map((t) => t.trim()).filter(Boolean)[0] || ""; // 입력한 대소문자 그대로
    Sessions.resetFilters();
    if (currentTab !== "sessions") switchTab("sessions"); else Views.sessions();
  },
  rowsHTML(list) {
    return list.map((x) => {
      const n = this.related(x.q).length;
      return `<div class="sg-row">
        <div class="sg-main"><b>${x.official ? "📣 " : "📝 "}${esc(x.title)}</b>
          <span class="muted">검색어: ${esc(x.q)}${x.date ? ` · ${esc(dayLabel(x.date))}` : ""}</span></div>
        <div class="sg-act">
          ${x.official ? "" : `<button class="sg-btn" data-news-del="${esc(x.id)}" aria-label="삭제">✕</button>`}
          <button class="sg-btn primary" data-news-q="${esc(x.q)}"${n ? "" : " disabled"}>세션 ${n}</button>
        </div>
      </div>`;
    }).join("");
  },
  listHTML() {
    return this.items().length ? this.rowsHTML(this.items())
      : `<p class="muted">아직 적은 발표가 없어요. 키노트에서 들은 새 서비스·기능을 적어 두면 관련 세션을 바로 찾아 줘요.</p>`;
  },
  bodyHTML() {
    return `<div id="nw-list">${this.listHTML()}</div>
      <h3 class="sg-head">발표 메모 추가</h3>
      <label class="field" for="nw-title">무엇이 발표됐나요?</label>
      <input type="text" id="nw-title" maxlength="60" placeholder="예: Bedrock 에이전트 새 기능">
      <label class="field" for="nw-q">관련 세션을 찾을 검색어 (쉼표로 여러 개)</label>
      <input type="text" id="nw-q" maxlength="60" placeholder="예: Bedrock, agent">
      <button class="btn ghost block" id="nw-add" style="margin-top:0;">＋ 추가</button>
      <p class="muted" style="font-size:12px;">세션 제목·코드·AWS 서비스에서 검색어를 찾아요.</p>`;
  },
  bind(root) {
    const bindList = () => {
      $$("#nw-list [data-news-q]", root).forEach((b) => b.onclick = () => this.show(b.dataset.newsQ));
      $$("#nw-list [data-news-del]", root).forEach((b) => b.onclick = () => {
        S().news = (S().news || []).filter((x) => x.id !== b.dataset.newsDel); Store.save();
        $("#nw-list", root).innerHTML = this.listHTML(); bindList();
        Notes.refreshHome();
      });
    };
    bindList();
    $("#nw-add", root).onclick = () => {
      const title = $("#nw-title", root).value.trim();
      const q = $("#nw-q", root).value.trim() || title;
      if (!title) { toast("발표 내용을 적어 주세요"); $("#nw-title", root).focus(); return; }
      S().news = S().news || [];
      S().news.unshift({ id: "nw" + Date.now().toString(36), title, q, date: vegasDateStr() });
      Store.save();
      $("#nw-title", root).value = ""; $("#nw-q", root).value = "";
      $("#nw-list", root).innerHTML = this.listHTML(); bindList();
      Notes.refreshHome();
      toast(`관련 세션 ${this.related(q).length}개를 찾았어요`);
    };
  }
};

/* 노트 허브 시트 */
const Notes = {
  tab: "sessions",
  TABS: [["sessions", "세션 노트"], ["news", "발표 노트"], ["expo", "부스 스탬프"]],
  refreshHome() { if (currentTab === "home" && Views.home) Views.home(); },
  open(tab) {
    if (tab) this.tab = tab;
    openSheet({
      title: "📝 노트",
      body: `<div class="seg" id="nt-seg">${this.TABS.map(([v, l]) => `<button class="seg-btn" data-nt="${v}">${l}</button>`).join("")}</div>
        <div id="nt-body"></div>`,
      actions: `<span id="nt-actions" style="display:contents"></span>`
    });
    $$("#nt-seg [data-nt]").forEach((b) => b.onclick = () => { this.tab = b.dataset.nt; this.render(); });
    this.render();
  },
  render() {
    const body = $("#nt-body"), act = $("#nt-actions");
    if (!body) return;
    $$("#nt-seg [data-nt]").forEach((b) => b.classList.toggle("on", b.dataset.nt === this.tab));
    if (this.tab === "news") body.innerHTML = News.bodyHTML();
    else if (this.tab === "expo") body.innerHTML = Expo.bodyHTML();
    else body.innerHTML = SessionNotes.bodyHTML();
    act.innerHTML = this.tab === "sessions"
      ? `<button class="btn ghost" id="nt-close">닫기</button><button class="btn" id="nt-export">📄 텍스트로 내보내기</button>`
      : `<button class="btn" id="nt-close">닫기</button>`;
    $("#nt-close").onclick = () => $("#modal-overlay")._dismiss();
    const ex = $("#nt-export");
    if (ex) ex.onclick = () => SessionNotes.exportTxt();
    if (this.tab === "news") News.bind(body);
    else if (this.tab === "expo") Expo.bind(body, () => this.render());
    else SessionNotes.bind(body);
  }
};
