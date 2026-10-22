/* re:Invent 2026 출장 앱 — Expo 부스 스탬프 투어
   공식 부스 목록 데이터가 없으므로 사용자가 직접 부스를 추가하는 방식.
   저장: S().expo_booths = [{id, name, note, visited, visited_at}] */
"use strict";

const Expo = {
  list() {
    if (!Array.isArray(S().expo_booths)) S().expo_booths = [];
    return S().expo_booths;
  },
  visitedCount() { return this.list().filter((b) => b.visited).length; },

  toggle(id) {
    const b = this.list().find((x) => x.id === id);
    if (!b) return;
    b.visited = !b.visited;
    b.visited_at = b.visited ? new Date().toISOString() : null;
    Store.save();
  },
  add(name, note) {
    const v = String(name || "").trim();
    if (!v) { toast("부스 이름을 입력해 주세요"); return false; }
    this.list().push({
      id: "bx" + Date.now().toString(36),
      name: v, note: String(note || "").trim(),
      visited: false, visited_at: null
    });
    Store.save();
    return true;
  },
  remove(id) {
    S().expo_booths = this.list().filter((x) => x.id !== id);
    Store.save();
  },

  rowHTML(b) {
    return `<div class="sg-row${b.visited ? " done" : ""}" data-booth="${esc(b.id)}" role="button" tabindex="0">
      <div class="sg-main">
        <b>${b.visited ? "✅ " : "⭕ "}${esc(b.name)}</b>
        ${b.note ? `<span class="muted">${esc(b.note)}</span>` : ""}
      </div>
      <div class="sg-act">
        <button class="sg-btn" data-booth-del="${esc(b.id)}" aria-label="삭제">✕</button>
      </div>
    </div>`;
  },

  open() {
    const render = () => {
      const list = this.list();
      const done = this.visitedCount();
      const pct = list.length ? Math.round((done / list.length) * 100) : 0;
      return `
        <div class="card" style="margin:0 0 10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <b>🎪 스탬프 ${done}/${list.length}</b><span class="muted">${pct}%</span>
          </div>
          <div class="progress"><div style="width:${pct}%"></div></div>
          <p class="muted" style="font-size:12px;margin:6px 0 0;">부스를 눌러 방문 스탬프를 찍으세요. 공식 부스 목록은 없어서 직접 추가하는 방식이에요.</p>
        </div>
        <div id="bx-list">${list.length ? list.map((b) => this.rowHTML(b)).join("") : `<p class="muted">아직 등록한 부스가 없어요. 아래에서 추가해 보세요.</p>`}</div>
        <h3 class="sg-head">부스 추가</h3>
        <label class="field" for="bx-name">부스 이름</label>
        <input type="text" id="bx-name" maxlength="60" placeholder="예: Anthropic, Datadog">
        <label class="field" for="bx-note">메모 (선택)</label>
        <input type="text" id="bx-note" maxlength="80" placeholder="예: 굿즈 — 티셔츠, 담당자 명함 받기">
        <button class="btn block" id="bx-add">추가하기</button>`;
    };
    openSheet({
      title: "🎪 Expo 부스 스탬프 투어",
      body: `<div id="bx-body">${render()}</div>`,
      actions: `<button class="btn ghost block" id="bx-close">닫기</button>`
    });
    const refresh = () => { $("#bx-body").innerHTML = render(); bind(); };
    const bind = () => {
      $$("#bx-list [data-booth]").forEach((el) => {
        el.onclick = (e) => {
          if (e.target.dataset.boothDel) return;
          this.toggle(el.dataset.booth);
          refresh();
          if (currentTab === "home" && Views.home) Views.home();
        };
      });
      $$("#bx-list [data-booth-del]").forEach((el) => {
        el.onclick = (e) => {
          e.stopPropagation();
          this.remove(el.dataset.boothDel);
          refresh();
          if (currentTab === "home" && Views.home) Views.home();
        };
      });
      $("#bx-add").onclick = () => {
        if (this.add($("#bx-name").value, $("#bx-note").value)) {
          refresh();
          if (currentTab === "home" && Views.home) Views.home();
          toast("부스를 추가했어요 🎪");
        }
      };
    };
    bind();
    $("#bx-close").onclick = () => $("#modal-overlay")._dismiss();
  },

  /* 공식 운영 시간: event_info.expo의 요일별 값 "11/30 4:00 PM–7:00 PM (오픈)" */
  hoursHTML() {
    const e = (window.APP_DATA.event_info || {}).expo || {};
    const rows = ["monday", "tuesday", "wednesday", "thursday"].map((k) => e[k]).filter(Boolean).map((v) => {
      const [md, ...rest] = String(v).split(" ");
      const [m, d] = md.split("/");
      return `<div class="kv"><span>${esc(dayLabel(`${EVENT_START.slice(0, 4)}-${pad2(m)}-${pad2(d)}`))}</span><b>${esc(rest.join(" "))}</b></div>`;
    });
    return rows.length ? `<div class="muted" style="font-size:12px;">운영 시간 · 📍 Venetian${e.partners ? " · " + esc(e.partners) : ""}</div>${rows.join("")}` : "";
  },

  /* 홈 탭 카드 */
  cardHTML() {
    const list = this.list();
    const done = this.visitedCount();
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    return `<div class="card"><h3>🎪 Expo · 부스 스탬프</h3>
      ${this.hoursHTML()}
      ${list.length
        ? `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
             <b>${done}/${list.length} 방문</b><span class="muted">${pct}%</span></div>
           <div class="progress"><div style="width:${pct}%"></div></div>`
        : `<p class="muted" style="margin:0;">관심 있는 스폰서 부스를 등록하고 방문 스탬프를 모아 보세요.</p>`}
      <button class="btn ghost block small" id="home-expo" style="margin-top:8px;">스탬프 투어 열기</button>
    </div>`;
  },
  bindCard() {
    const b = $("#home-expo");
    if (b) b.onclick = () => this.open();
  }
};
