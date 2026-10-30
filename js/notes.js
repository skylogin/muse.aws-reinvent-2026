/* 📝 노트 허브: 세션 노트 · 발표 노트 · 부스 스탬프 · 만난 사람을 한 시트에서 + 출장 결과 보고서 */
"use strict";

/* 세션 노트: 별점·메모·팀 적용점을 남긴 세션 목록 + 텍스트 내보내기
   저장은 write() 한 곳에서 — 세션 상세와 내 일정 시트가 같은 칸을 고쳐도 다른 칸을 지우지 않게 */
const SessionNotes = {
  items() {
    const notes = S().session_notes || {};
    return Object.keys(notes)
      .filter((id) => notes[id] && (notes[id].rating || notes[id].memo || notes[id].apply))
      .map((id) => ({ id, ...notes[id], s: allSessions().find((x) => x.session_id === id) }))
      .sort((a, b) => String((a.s || {}).date || "") + String((a.s || {}).start_time || "") > String((b.s || {}).date || "") + String((b.s || {}).start_time || "") ? 1 : -1);
  },
  get(id) { return (S().session_notes || {})[id] || { rating: 0, memo: "", apply: "" }; },
  /* patch: 바꿀 칸만 ({rating}, {memo, apply} …). 세 칸이 모두 비면 노트를 지움 */
  write(id, patch) {
    const n = { ...this.get(id), ...patch };
    const rating = +n.rating || 0, memo = String(n.memo || "").trim(), apply = String(n.apply || "").trim();
    if (rating || memo || apply) S().session_notes[id] = { rating, memo, apply, updated_at: new Date().toISOString() };
    else delete S().session_notes[id];
    Store.save();
  },
  stars(r) { return r ? "★".repeat(r) + "☆".repeat(5 - r) : "☆☆☆☆☆"; },
  cut(t, n) { return t.length > n ? t.slice(0, n) + "…" : t; },
  bodyHTML() {
    const list = this.items();
    if (!list.length) return `<p class="muted">아직 남긴 노트가 없어요. 세션 상세에서 별점·메모·팀 적용점을 남겨 보세요.</p>`;
    return list.map((x) => `
      <div class="sg-row" data-note-open="${esc(x.id)}" role="button" tabindex="0">
        <div class="sg-main"><b>${esc((x.s || {}).title || x.id)}</b>
          <span class="muted">${x.s && x.s.date ? esc(dayLabel(x.s.date)) + " " + esc(x.s.start_time || "") : ""}${x.s && x.s.venue ? " · " + esc(x.s.venue) : ""}</span>
          ${x.memo ? `<span style="display:block;font-size:13px;margin-top:2px;">${esc(this.cut(x.memo, 80))}</span>` : ""}
          ${x.apply ? `<span style="display:block;font-size:13px;margin-top:2px;">🏢 ${esc(this.cut(x.apply, 60))}</span>` : ""}
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
      if (x.apply) lines.push(`  팀 적용점: ${x.apply}`);
      lines.push("");
    });
    download("reinvent2026-session-notes.txt", lines.join("\n"), "text/plain;charset=utf-8");
    toast("노트를 저장했어요 📄");
  }
};

/* 만난 사람: 부스·세션에서 만난 사람과 후속 할 일 (이 기기와 '다른 기기와 이어하기' 파일에만 저장) */
const People = {
  list() {
    if (!Array.isArray(S().people)) S().people = [];
    return S().people;
  },
  followUps() { return this.list().filter((p) => p.follow_up && !p.follow_done); },
  contactHTML(c) {
    const v = String(c || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\/(www\.)?/i, ""))}</a>`;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    return esc(v);
  },
  rowHTML(p) {
    const who = [p.company, p.role].filter(Boolean).join(" · ");
    return `<div class="sg-row${p.follow_done ? " done" : ""}">
      <div class="sg-main"><b>👤 ${esc(p.name)}</b>
        ${who || p.met_at ? `<span class="muted">${esc(who)}${who && p.met_at ? " · " : ""}${p.met_at ? "📍 " + esc(p.met_at) : ""}</span>` : ""}
        ${p.topic ? `<span style="display:block;font-size:13px;margin-top:2px;">💬 ${esc(p.topic)}</span>` : ""}
        ${p.follow_up ? `<span style="display:block;font-size:13px;margin-top:2px;">${p.follow_done ? "✅" : "⬜"} 후속: ${esc(p.follow_up)}</span>` : ""}
        ${p.contact ? `<span class="muted" style="display:block;font-size:12px;margin-top:2px;">🔗 ${this.contactHTML(p.contact)}</span>` : ""}
      </div>
      <div class="sg-act">
        ${p.follow_up ? `<button class="sg-btn${p.follow_done ? " on" : ""}" data-pp-done="${esc(p.id)}" aria-label="후속 완료 표시">${p.follow_done ? "완료" : "할 일"}</button>` : ""}
        <button class="sg-btn" data-pp-del="${esc(p.id)}" aria-label="삭제">✕</button>
      </div>
    </div>`;
  },
  listHTML() {
    const list = this.list();
    return list.length ? list.map((p) => this.rowHTML(p)).join("")
      : `<p class="muted">아직 기록한 사람이 없어요. 부스·세션에서 이야기 나눈 사람과 후속 할 일을 적어 두세요.</p>`;
  },
  bodyHTML() {
    const f = (id, label, ph, max) => `<label class="field" for="${id}">${label}</label><input type="text" id="${id}" maxlength="${max || 80}" placeholder="${ph}">`;
    return `<div id="pp-list">${this.listHTML()}</div>
      <h3 class="sg-head">사람 추가</h3>
      ${f("pp-name", "이름 *", "예: Jane Doe", 40)}
      <div class="row"><div>${f("pp-company", "회사", "예: Datadog", 40)}</div><div>${f("pp-role", "직무", "예: Solutions Architect", 40)}</div></div>
      ${f("pp-met", "어디서", "예: Expo Datadog 부스, CMP301 세션", 60)}
      ${f("pp-topic", "나눈 이야기", "예: EKS 비용 모니터링 사례", 120)}
      ${f("pp-follow", "후속 할 일", "예: 데모 자료 메일로 받기", 120)}
      ${f("pp-contact", "연락처 (메일·LinkedIn 주소)", "선택", 120)}
      <button class="btn ghost block" id="pp-add" style="margin-top:0;">＋ 추가</button>
      <p class="muted" style="font-size:12px;">이 기기와 '다른 기기와 이어하기' 파일에만 저장돼요. 출장 보고서에는 '만난 사람 포함'을 켤 때만 이름이 들어가요.</p>`;
  },
  bind(root) {
    const paint = () => { $("#pp-list", root).innerHTML = this.listHTML(); bindList(); };
    const bindList = () => {
      $$("#pp-list [data-pp-done]", root).forEach((b) => b.onclick = () => {
        const p = this.list().find((x) => x.id === b.dataset.ppDone);
        if (p) { p.follow_done = !p.follow_done; Store.save(); paint(); }
      });
      $$("#pp-list [data-pp-del]", root).forEach((b) => b.onclick = () => {
        if (!confirm("이 사람 기록을 지울까요?")) return;
        S().people = this.list().filter((x) => x.id !== b.dataset.ppDel); Store.save(); paint();
      });
    };
    bindList();
    $("#pp-add", root).onclick = () => {
      const g = (id) => $("#" + id, root).value.trim();
      if (!g("pp-name")) { toast("이름을 적어 주세요"); $("#pp-name", root).focus(); return; }
      this.list().unshift({ id: "pp" + Date.now().toString(36), name: g("pp-name"), company: g("pp-company"), role: g("pp-role"),
        met_at: g("pp-met"), topic: g("pp-topic"), follow_up: g("pp-follow"), follow_done: false, contact: g("pp-contact"), at: vegasDateStr() });
      Store.save();
      ["pp-name", "pp-company", "pp-role", "pp-met", "pp-topic", "pp-follow", "pp-contact"].forEach((id) => { $("#" + id, root).value = ""; });
      paint();
      toast("기록했어요 👤");
    };
  }
};

/* 출장 결과 보고서: 노트·발표 메모·만난 사람·회사 지출을 모아 회사에 내는 문서로 (Markdown 복사·저장) */
const TripReport = {
  /* 보고서 구조 하나에서 Markdown과 화면을 함께 만듦: [{ h, lines: [문자열 | {h3, lines}] }] */
  model() {
    const st = S(), r = st.trip_report || {};
    const planned = [...new Set(Object.values(st.daily_plan || {}).flat().map((p) => p && p.session_id).filter(Boolean))];
    const byId = new Map(allSessions().map((s) => [s.session_id, s]));
    const types = {};
    planned.forEach((id) => { const t = typeKo((byId.get(id) || {}).session_type); if (t) types[t] = (types[t] || 0) + 1; });
    const notes = SessionNotes.items();
    const rated = notes.filter((x) => x.rating);
    const avg = rated.length ? (rated.reduce((a, x) => a + x.rating, 0) / rated.length).toFixed(1) : null;
    const news = News.items();
    const people = People.list();
    const fmt = (n) => Math.round(+n || 0).toLocaleString("ko-KR");
    const out = [];
    out.push({ h: "개요", lines: [
      `기간: 2026-11-30 ~ 2026-12-04 · 미국 라스베가스 (AWS re:Invent 2026)`,
      `참석자: ${st.profile.nickname || "-"}`,
      `일정에 담은 세션 ${planned.length}개${Object.keys(types).length ? ` (${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", ")})` : ""}`,
      `노트를 남긴 세션 ${notes.length}개${avg ? ` · 평균 별점 ${avg}` : ""}`,
      `발표 메모 ${news.length}건 · 방문한 부스 ${Expo.visitedCount()}곳 · 만난 사람 ${people.length}명`
    ] });
    if (String(r.summary || "").trim()) out.push({ h: "총평", lines: String(r.summary).trim().split("\n") });
    if (news.length) out.push({ h: "주요 발표", lines: news.map((x) => `${x.title}${x.date ? ` (${dayLabel(x.date)})` : ""}`) });
    if (notes.length) {
      const sorted = notes.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
      out.push({ h: "세션별 배운 점", lines: sorted.map((x) => {
        const s = x.s || {};
        const lines = [];
        if (s.date) lines.push(`${dayLabel(s.date)} ${s.start_time || ""}${s.venue ? " · " + s.venue : ""}${x.rating ? " · " + this.stars(x.rating) : ""}`);
        if (x.memo) lines.push(`배운 점: ${x.memo}`);
        if (x.apply) lines.push(`팀 적용점: ${x.apply}`);
        return { h3: `[${s.code || x.id}] ${s.title || x.id}`, lines };
      }) });
    }
    const acts = String(r.actions || "").trim() ? String(r.actions).trim().split("\n") : [];
    notes.filter((x) => x.apply).forEach((x) => acts.push(`[${(x.s || {}).code || x.id}] ${x.apply}`));
    People.followUps().forEach((p) => acts.push(`${r.include_people ? p.name + (p.company ? `(${p.company})` : "") : (p.company || "만난 사람")}: ${p.follow_up}`));
    if (acts.length) out.push({ h: "팀 적용·후속 액션", lines: acts });
    if (r.include_people && people.length) {
      out.push({ h: "만난 사람", lines: people.map((p) => [p.name, [p.company, p.role].filter(Boolean).join(" · "), p.topic].filter(Boolean).join(" — ")) });
    }
    const co = st.expenses.filter((e) => e.owner === "company");
    if (co.length) {
      const by = {};
      co.forEach((e) => { const k = EXP_CATS[e.category] || e.category || "기타"; by[k] = by[k] || { usd: 0, krw: 0 }; by[k].usd += +e.amount_usd || 0; by[k].krw += +e.amount_krw || 0; });
      const tu = co.reduce((a, e) => a + (+e.amount_usd || 0), 0), tk = co.reduce((a, e) => a + (+e.amount_krw || 0), 0);
      out.push({ h: "경비 요약 (회사 지출)", lines: Object.entries(by).sort((a, b) => b[1].usd - a[1].usd)
        .map(([k, v]) => `${k}: $${fmt(v.usd)} (₩${fmt(v.krw)})`)
        .concat([`합계: $${fmt(tu)} (₩${fmt(tk)}) · ${co.length}건 · 영수증 사진 ${co.filter((e) => e.receipt_img).length}장`]) });
    }
    return out.map((sec, i) => ({ ...sec, h: `${i + 1}. ${sec.h}` })); // 있는 장만 번호를 매김
  },
  stars(r) { return "★".repeat(r) + "☆".repeat(5 - r); },
  markdown() {
    const md = ["# re:Invent 2026 출장 결과 보고서", ""];
    this.model().forEach((sec) => {
      md.push(`## ${sec.h}`, "");
      sec.lines.forEach((l) => {
        if (typeof l === "string") { md.push(`- ${l}`); return; }
        md.push("", `### ${l.h3}`, ...l.lines.map((x) => `- ${x}`));
      });
      md.push("");
    });
    md.push(`---`, `작성: re:Invent 2026 출장 앱 · ${vegasDateStr()}`);
    return md.join("\n");
  },
  previewHTML() {
    return `<h2 style="margin:0 0 8px;">re:Invent 2026 출장 결과 보고서</h2>` + this.model().map((sec) => `<h3 class="tr-h">${esc(sec.h)}</h3>` +
      sec.lines.map((l) => typeof l === "string" ? `<div class="tr-li">${esc(l)}</div>`
        : `<div class="tr-sub"><b>${esc(l.h3)}</b>${l.lines.map((x) => `<div class="tr-li">${esc(x)}</div>`).join("")}</div>`).join("")).join("");
  },
  open() {
    let root = $("#report-screen");
    if (!root) {
      root = document.createElement("div");
      root.id = "report-screen";
      document.body.appendChild(root);
    }
    const r = S().trip_report;
    root.innerHTML = `
      <div class="report-screen-head">
        <button class="btn ghost small" id="tr-back">◀ 뒤로</button>
        <strong>📄 출장 결과 보고서</strong>
        <span style="width:64px;"></span>
      </div>
      <div class="report-screen-body">
        <div class="card">
          <label class="field" for="tr-sum">총평 <span class="muted">(직접 쓰기)</span></label>
          <textarea id="tr-sum" rows="3" placeholder="예: 에이전트 AI 운영 사례가 많았고, 우리 팀 MLOps에 바로 쓸 수 있는 내용이 많았다.">${esc(r.summary)}</textarea>
          <label class="field" for="tr-act">팀 적용·후속 액션 <span class="muted">(한 줄에 하나)</span></label>
          <textarea id="tr-act" rows="3" placeholder="예: 1월에 Bedrock Agents PoC 진행">${esc(r.actions)}</textarea>
          <label class="check-item" style="margin-top:6px;"><input type="checkbox" id="tr-people"${r.include_people ? " checked" : ""}><span>만난 사람의 이름 포함</span></label>
          <p class="muted" style="font-size:12px;margin:4px 0 8px;">세션 노트의 '팀 적용점'과 만난 사람의 후속 할 일은 자동으로 들어가요. 경비는 회사 지출만 넣어요.</p>
          <div class="row">
            <button class="btn" id="tr-copy">📋 복사</button>
            <button class="btn ghost" id="tr-save">💾 Markdown 저장</button>
          </div>
        </div>
        <div class="report tr-preview" id="tr-preview">${this.previewHTML()}</div>
      </div>`;
    root.classList.add("open");
    Nav.sync();
    let t = null;
    const save = () => {
      clearTimeout(t);
      S().trip_report = { summary: $("#tr-sum").value, actions: $("#tr-act").value, include_people: $("#tr-people").checked };
      Store.save();
      $("#tr-preview").innerHTML = this.previewHTML();
    };
    ["tr-sum", "tr-act"].forEach((id) => $("#" + id).addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 400); }));
    $("#tr-people").onchange = save;
    $("#tr-back").onclick = () => { save(); root.classList.remove("open"); Nav.sync(); };
    $("#tr-copy").onclick = async () => {
      save();
      const md = this.markdown();
      try { await navigator.clipboard.writeText(md); toast("보고서를 복사했어요 — 메일·문서에 붙여넣으세요"); }
      catch (e) { prompt("아래 내용을 복사하세요", md); }
    };
    $("#tr-save").onclick = () => {
      save();
      download(`reinvent2026-출장보고서-${vegasDateStr()}.md`, this.markdown(), "text/markdown;charset=utf-8");
      toast("보고서 파일을 저장했어요 📄");
    };
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
  TABS: [["sessions", "세션 노트"], ["news", "발표 노트"], ["expo", "부스 스탬프"], ["people", "만난 사람"]],
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
    else if (this.tab === "people") body.innerHTML = People.bodyHTML();
    else body.innerHTML = SessionNotes.bodyHTML() + `<div class="row" style="margin-top:12px;">
        <button class="btn ghost small" id="nt-export">📄 텍스트로 내보내기</button>
        <button class="btn ghost small" id="nt-report">📑 출장 결과 보고서</button></div>`;
    act.innerHTML = `<button class="btn" id="nt-close">닫기</button>`;
    $("#nt-close").onclick = () => $("#modal-overlay")._dismiss();
    const ex = $("#nt-export"), rp = $("#nt-report");
    if (ex) ex.onclick = () => SessionNotes.exportTxt();
    if (rp) rp.onclick = () => { closeModal(); TripReport.open(); };
    if (this.tab === "news") News.bind(body);
    else if (this.tab === "expo") Expo.bind(body, () => this.render());
    else if (this.tab === "people") People.bind(body);
    else SessionNotes.bind(body);
  }
};
