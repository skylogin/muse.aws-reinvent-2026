/* 동료 일정 공유: 내 일정을 링크·QR·코드로 보내고, 받은 일정은 시간표에 [이름] 블록으로 겹쳐 보기 (서버 없음) */
"use strict";

/* 동료별 색 [라이트 테두리·이름표, 다크 테두리·이름표, 라이트 배경, 다크 배경] — 빗금 무늬로 내 일정과 구분 */
const PEER_COLORS = [
  ["#0284c7", "#38bdf8", "#e0f2fe", "#0c2f45"],
  ["#db2777", "#f472b6", "#fce7f3", "#3f1530"],
  ["#7c3aed", "#a78bfa", "#ede9fe", "#2a1a4d"],
  ["#0d9488", "#2dd4bf", "#ccfbf1", "#0f3532"],
  ["#ea580c", "#fb923c", "#ffedd5", "#40200c"],
  ["#4d7c0f", "#a3e635", "#ecfccb", "#1f2e0b"]
];

const Share = {
  encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(code) {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  },
  /* 보내는 내용: 이름 + 날짜별 세션 id 목록 (메모·지출·예약 상태는 보내지 않음) */
  payload(name) {
    const d = {};
    DAYS.forEach((day) => {
      const ids = (S().daily_plan[day] || []).map((p) => p.session_id).filter((id) => Planner.sessionById(id));
      if (ids.length) d[day.slice(5).replace("-", "")] = ids.join(",");
    });
    return { v: 1, n: (name || "").slice(0, 20), d, t: Math.floor(Date.now() / 1000) };
  },
  link(code) { return location.origin + location.pathname + "#share=" + code; },
  extract(text) {
    const m = String(text || "").match(/share=([A-Za-z0-9_-]+)/);
    return m ? m[1] : String(text || "").trim().replace(/\s+/g, "");
  },
  parse(text) {
    const o = this.decode(this.extract(text));
    if (!o || o.v !== 1 || typeof o.d !== "object") throw new Error("invalid");
    const days = {};
    Object.keys(o.d).forEach((k) => {
      if (!/^\d{4}$/.test(k)) return;
      const day = `2026-${k.slice(0, 2)}-${k.slice(2)}`;
      const ids = String(o.d[k]).split(",").filter((id) => Planner.sessionById(id));
      if (ids.length) days[day] = ids;
    });
    return { name: String(o.n || "동료").slice(0, 20) || "동료", days, at: (o.t || 0) * 1000 };
  },
  count(days) { return Object.values(days).reduce((a, x) => a + x.length, 0); },
  peers() { return S().peers || (S().peers = []); },
  peer(id) { return this.peers().find((p) => p.id === id); },
  color(p) {
    const c = PEER_COLORS[p.color % PEER_COLORS.length];
    const dark = document.documentElement.dataset.theme === "dark";
    return { line: dark ? c[1] : c[0], bg: dark ? c[3] : c[2] };
  },
  dotHTML(p) { return `<span class="peer-dot" style="background:${this.color(p).line}"></span>`; },

  /* 시간표용: 보이는 동료들의 그 날 세션 [{peer, s}] */
  sessionsFor(date) {
    const out = [];
    this.peers().filter((p) => p.visible !== false).forEach((p) => {
      (p.days[date] || []).forEach((id) => { const s = Planner.sessionById(id); if (s) out.push({ peer: p, s }); });
    });
    return out;
  },
  /* 이 세션을 함께 담은 동료 (보이는 동료만) */
  withPeers(id, date) { return this.peers().filter((p) => p.visible !== false && (p.days[date] || []).includes(id)); },

  /* ---- 공유·받기 시트 ---- */
  open() {
    const myCount = Object.values(this.payload("").d).reduce((a, x) => a + x.split(",").length, 0);
    openSheet({
      title: "👥 일정 공유",
      body: `
        <h3 class="sg-head" style="margin-top:2px;">내 일정 보내기</h3>
        ${myCount ? `
        <label class="field" for="sh-name">보낼 이름</label>
        <input type="text" id="sh-name" maxlength="20" value="${esc(S().profile.nickname || "")}" placeholder="예: 홍길동">
        <div class="qr-wrap" id="sh-qr"></div>
        <p class="muted" style="font-size:12px;text-align:center;margin:6px 0 10px;">동료가 휴대폰 카메라로 찍거나, 링크를 받아 열면 돼요<br>세션 ${myCount}개 · 메모·지출·예약 상태는 보내지 않아요</p>
        <div class="row">
          <button class="btn ghost" id="sh-copy">🔗 링크 복사</button>
          <button class="btn" id="sh-send">📤 공유하기</button>
        </div>` : `<p class="muted">아직 내 일정에 담은 세션이 없어요. 세션 탭에서 ☆로 담은 뒤 공유해 보세요.</p>`}
        <h3 class="sg-head" style="margin-top:20px;">받은 일정 넣기</h3>
        <p class="muted" style="font-size:12px;margin:0 0 4px;">동료에게 받은 링크나 코드를 붙여넣으세요. 홈 화면 앱은 링크를 열면 브라우저로 열려서, 여기에 붙여넣어야 앱에 들어가요.</p>
        <textarea id="sh-in" rows="2" placeholder="https://…#share=… 또는 코드"></textarea>
        <button class="btn ghost block" id="sh-load" style="margin-top:0;">불러오기</button>
        ${this.peers().length ? `<button class="link-btn" id="sh-manage">받은 동료 일정 관리 (${this.peers().length}명) ›</button>` : ""}`,
      actions: `<button class="btn" id="sh-close">닫기</button>`
    });
    $("#sh-close").onclick = () => $("#modal-overlay")._dismiss();
    const nameEl = $("#sh-name");
    let url = "";
    const build = () => {
      url = this.link(this.encode(this.payload(nameEl.value.trim() || "동료")));
      const box = $("#sh-qr");
      try {
        const q = qrcode(0, "L"); q.addData(url); q.make();
        box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: "내 일정 공유 QR 코드" });
      } catch (e) { box.innerHTML = `<p class="muted">일정이 많아 QR을 만들 수 없어요 — 링크로 보내 주세요</p>`; }
    };
    if (nameEl) {
      build();
      let t; nameEl.addEventListener("input", () => { clearTimeout(t); t = setTimeout(build, 250); });
      $("#sh-copy").onclick = async () => {
        if (!nameEl.value.trim()) { toast("보낼 이름을 입력해 주세요"); nameEl.focus(); return; }
        try { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); }
        catch (e) { prompt("아래 링크를 복사하세요", url); }
      };
      $("#sh-send").onclick = async () => {
        if (!nameEl.value.trim()) { toast("보낼 이름을 입력해 주세요"); nameEl.focus(); return; }
        const text = `${nameEl.value.trim()}님의 re:Invent 2026 일정이에요. 열어서 내 시간표에 겹쳐 보세요.`;
        if (navigator.share) { try { await navigator.share({ title: "re:Invent 2026 일정", text, url }); } catch (e) { /* 취소 */ } }
        else { try { await navigator.clipboard.writeText(url); toast("공유를 지원하지 않아 링크를 복사했어요"); } catch (e) { prompt("아래 링크를 복사하세요", url); } }
      };
    }
    $("#sh-load").onclick = () => {
      try { const o = this.parse($("#sh-in").value); closeModal(); this.preview(o); }
      catch (e) { toast("링크나 코드를 읽을 수 없어요. 다시 확인해 주세요."); }
    };
    const mg = $("#sh-manage");
    if (mg) mg.onclick = () => { closeModal(); this.openManage(); };
  },

  /* 받은 일정 미리보기 → 추가 */
  preview(o, fromLink) {
    const n = this.count(o.days);
    const exist = this.peers().find((p) => p.name === o.name);
    const days = Object.keys(o.days).sort();
    const browserNote = fromLink && !isStandalone();
    openSheet({
      title: "👥 동료 일정 받기",
      body: `
        <h3 class="bs-title">${esc(o.name)}님 일정</h3>
        <div class="info-list">
          <span>🎙️</span><span>세션 <b>${n}개</b>${o.at ? ` <span class="muted">· ${esc(new Date(o.at).toLocaleDateString("ko-KR"))} 기준</span>` : ""}</span>
          <span>🎨</span><span>내 시간표에 <b>[${esc(o.name)}]</b> 빗금 블록으로 겹쳐 보여요. 날짜 위 이름표로 켜고 끌 수 있어요.</span>
        </div>
        ${days.map((d) => `<div class="kv"><span>${esc(dayLabel(d))}</span><b>${o.days[d].length}개</b></div>`).join("") || `<p class="muted">담긴 세션이 없어요.</p>`}
        ${exist ? `<div class="notice">이미 받은 '${esc(o.name)}' 일정이 있어요. 새 내용으로 바꿔요.</div>` : ""}
        ${browserNote ? `<div class="warn-box">📱 홈 화면에 설치한 앱을 쓰고 있다면, 이 브라우저와 앱은 저장 공간이 따로예요.
          <b>코드 복사</b> 후 앱 → 내 일정 → 👥 일정 공유 → '받은 일정 넣기'에 붙여넣으세요.
          <button class="btn ghost small block" id="pv-copy" style="margin-top:8px;">코드 복사</button></div>` : ""}`,
      actions: `<button class="btn ghost" id="pv-cancel">취소</button><button class="btn" id="pv-add"${n ? "" : " disabled"}>${exist ? "업데이트" : "내 시간표에 추가"}</button>`
    });
    $("#pv-cancel").onclick = () => $("#modal-overlay")._dismiss();
    const cp = $("#pv-copy");
    if (cp) cp.onclick = async () => {
      const code = this.encode({ v: 1, n: o.name, d: Object.fromEntries(days.map((d) => [d.slice(5).replace("-", ""), o.days[d].join(",")])), t: Math.floor((o.at || Date.now()) / 1000) });
      try { await navigator.clipboard.writeText(code); toast("코드를 복사했어요"); } catch (e) { prompt("아래 코드를 복사하세요", code); }
    };
    $("#pv-add").onclick = () => {
      const list = this.peers();
      if (exist) Object.assign(exist, { days: o.days, at: o.at || Date.now(), visible: true });
      else {
        const used = list.map((p) => p.color);
        const color = PEER_COLORS.findIndex((_, i) => !used.includes(i));
        list.push({ id: "pr" + Date.now().toString(36), name: o.name, days: o.days, at: o.at || Date.now(), visible: true, color: color >= 0 ? color : list.length % PEER_COLORS.length });
      }
      Store.save();
      closeModal();
      toast(`${o.name}님 일정을 ${exist ? "업데이트" : "추가"}했어요 👥`);
      Planner.goto(days.find((d) => d >= todayClamped()) || days[0]);
    };
  },

  /* 받은 동료 일정 관리: 보이기/숨기기·삭제 */
  openManage() {
    const render = () => this.peers().map((p) => `
      <div class="peer-row">
        ${this.dotHTML(p)}
        <div class="peer-info"><b>${esc(p.name)}</b><span class="muted">세션 ${this.count(p.days)}개${p.at ? ` · ${esc(new Date(p.at).toLocaleDateString("ko-KR"))} 기준` : ""}</span></div>
        <button class="seg-btn${p.visible !== false ? " on" : ""}" data-pv="${p.id}" style="flex:0 0 auto;">${p.visible !== false ? "보이기" : "숨김"}</button>
        <button class="link-btn danger" data-pdel="${p.id}">삭제</button>
      </div>`).join("") || `<p class="muted">받은 동료 일정이 없어요.</p>`;
    openSheet({
      title: "👥 동료 일정 관리",
      body: `<div id="pm-list">${render()}</div>
        <p class="muted" style="font-size:12px;">동료가 일정을 바꾸면 새 링크를 다시 받아 넣으세요. 같은 이름이면 덮어써요.</p>`,
      actions: `<button class="btn ghost" id="pm-share">👥 공유·받기</button><button class="btn" id="pm-close">완료</button>`
    });
    const bind = () => {
      $$("#pm-list [data-pv]").forEach((b) => b.onclick = () => {
        const p = this.peer(b.dataset.pv); p.visible = p.visible === false; Store.save();
        $("#pm-list").innerHTML = render(); bind();
      });
      $$("#pm-list [data-pdel]").forEach((b) => b.onclick = () => {
        const p = this.peer(b.dataset.pdel);
        if (!p || !confirm(`${p.name}님 일정을 지울까요?`)) return;
        S().peers = this.peers().filter((x) => x !== p); Store.save();
        $("#pm-list").innerHTML = render(); bind();
      });
    };
    bind();
    $("#pm-close").onclick = () => { closeModal(); if (currentTab === "planner") Views.planner(); };
    $("#pm-share").onclick = () => { closeModal(); this.open(); };
  },

  /* 동료 블록을 눌렀을 때 */
  openItem(peerId, id, date) {
    const p = this.peer(peerId), s = Planner.sessionById(id);
    if (!p || !s) return;
    const mine = (S().daily_plan[date] || []).some((x) => x.session_id === id);
    const room = roomLabel(s);
    const kst = kstRange(s.date, s.start_time, s.end_time);
    openSheet({
      title: `👥 ${p.name}님 일정`,
      body: `
        <h3 class="bs-title">${esc(s.title)}</h3>
        <div class="info-list">
          <span>🕘</span><span><b>${esc(dayLabel(s.date))} ${esc(s.start_time || "")}–${esc(s.end_time || "")}</b> <span class="muted">현지</span></span>
          ${kst ? `<span>🇰🇷</span><span>${kst} <span class="muted">한국</span></span>` : ""}
          <span>📍</span><span>${esc(s.venue || "")}${room ? `<span class="muted"> · ${esc(room)}</span>` : ""}</span>
          <span>🏷️</span><span>${[s.code, s.session_type, s.level ? "Lv." + s.level : ""].filter(Boolean).map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</span>
        </div>
        ${mine ? `<div class="notice">✅ 나도 이 세션을 담았어요 — 같이 들어요!</div>` : ""}
        <div class="sheet-links">
          <button class="link-btn" id="pp-detail">세션 소개 보기</button>
          <button class="link-btn" id="pp-hide">${esc(p.name)}님 일정 숨기기</button>
        </div>`,
      actions: mine ? `<button class="btn" id="pp-close">닫기</button>`
        : `<button class="btn ghost" id="pp-close">닫기</button><button class="btn" id="pp-add">나도 담기</button>`
    });
    $("#pp-close").onclick = () => $("#modal-overlay")._dismiss();
    $("#pp-detail").onclick = () => { closeModal(); Sessions.openDetail(id); };
    $("#pp-hide").onclick = () => { p.visible = false; Store.save(); closeModal(); Views.planner(); toast(`${p.name}님 일정을 숨겼어요`); };
    const add = $("#pp-add");
    if (add) add.onclick = () => { closeModal(); Sessions.toggleFav(id); };
  },

  /* 링크(#share=…)로 열렸을 때 */
  pendingKey: "reinvent2026.pendingShare",
  checkLink() {
    const m = location.hash.match(/share=([A-Za-z0-9_-]+)/);
    if (m) {
      history.replaceState(null, "", location.pathname + location.search);
      try { sessionStorage.setItem(this.pendingKey, m[1]); } catch (e) { this._pending = m[1]; }
    }
    if (!S().onboarded) return; // 온보딩을 마친 뒤 다시 확인
    let code = this._pending;
    try { code = code || sessionStorage.getItem(this.pendingKey); sessionStorage.removeItem(this.pendingKey); } catch (e) { /* 무시 */ }
    this._pending = null;
    if (!code) return;
    try { this.preview(this.parse(code), true); } catch (e) { toast("공유 링크를 읽을 수 없어요"); }
  }
};

/* 앱이 열려 있는 상태에서 공유 링크로 들어온 경우 */
window.addEventListener("hashchange", () => { if (/share=/.test(location.hash) && Store.state) Share.checkLink(); });
