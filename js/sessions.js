/* 세션 탭: 카탈로그 탐색, 관심 체크, 용어 검색 */
"use strict";

const Sessions = {
  q: "", f: { date: "", venue: "", type: "", level: "", topic: "", format: "", delivery: "" },
  mode: "session", // session | term
  venueGroup: false, // 베뉴별 모아보기

  all() { return allSessions(); },
  pending() { return sessionsPending(); },

  filtered() {
    const q = this.q.trim().toLowerCase(), f = this.f;
    return this.all().filter((s) => {
      if (f.date && s.date !== f.date) return false;
      if (f.venue && s.venue !== f.venue) return false;
      if (f.type && s.session_type !== f.type) return false;
      if (f.level && String(s.level) !== f.level) return false;
      if (f.topic && !(s.topics || []).includes(f.topic)) return false;
      if (f.format && s.session_format !== f.format) return false;
      if (f.delivery && s.delivery !== f.delivery) return false;
      if (q) {
        const hay = `${s.title} ${(s.abstract || "")} ${(s.speakers || []).join(" ")} ${s.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  toggleFav(id) {
    const st = S();
    const i = st.favorites.indexOf(id);
    if (i >= 0) {
      st.favorites.splice(i, 1);
      // remove from daily plan
      Object.keys(st.daily_plan).forEach((d) => {
        st.daily_plan[d] = (st.daily_plan[d] || []).filter((x) => x.session_id !== id);
      });
      toast("관심 해제했어요");
      Store.save();
      Views.sessions();
    } else {
      const s = this.all().find((x) => x.session_id === id);
      const c = s ? this.findConflict(s) : null;
      if (c) {
        openModal(`
          <h2>⚠️ 시간이 겹쳐요</h2>
          <p><strong>${esc(s.title)}</strong><br>
          <span class="muted" style="font-size:13px;">${s.date ? esc(dayLabel(s.date)) + " " : ""}${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""} · ${esc(s.venue || "")}</span></p>
          <p style="font-size:14px;">이미 담은 일정과 겹칩니다:</p>
          <div class="card" style="margin:8px 0;"><strong>${esc(c.title)}</strong><br>
          <span class="muted" style="font-size:13px;">${esc(c.start_time || "")}${c.end_time ? "–" + esc(c.end_time) : ""} · ${esc(c.venue || "")}</span></div>
          <button class="btn block" id="cf-yes">그래도 담기</button>
          <button class="btn ghost block" id="cf-no">취소</button>`);
        $("#cf-yes").onclick = () => { this.doFavAdd(id); closeModal(); };
        $("#cf-no").onclick = closeModal;
        return;
      }
      this.doFavAdd(id);
    }
  },

  doFavAdd(id) {
    const st = S();
    if (!st.favorites.includes(id)) st.favorites.push(id);
    const s = this.all().find((x) => x.session_id === id);
    if (s && s.date) {
      st.daily_plan[s.date] = st.daily_plan[s.date] || [];
      if (!st.daily_plan[s.date].some((x) => x.session_id === id))
        st.daily_plan[s.date].push({ session_id: id, note: "" });
      toast("내 일정에 담았어요 📅");
    } else toast("관심 세션에 담았어요");
    Store.save();
    Views.sessions();
  },

  findConflict(s) {
    if (!s || !s.date || !s.start_time) return null;
    const toMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const s0 = toMin(s.start_time);
    const s1 = toMin(s.end_time) || s0 + 60;
    for (const x of (S().daily_plan[s.date] || [])) {
      if (x.session_id === s.session_id) continue;
      const o = this.all().find((y) => y.session_id === x.session_id);
      if (!o || !o.start_time) continue;
      const o0 = toMin(o.start_time);
      const o1 = toMin(o.end_time) || o0 + 60;
      if (s0 < o1 && o0 < s1) return o;
    }
    return null;
  },

  cardHTML(s) {
    const fav = S().favorites.includes(s.session_id);
    return `<div class="card session-card" data-id="${esc(s.session_id)}">
      <button class="fav-btn ${fav ? "on" : ""}" data-fav="${esc(s.session_id)}">${fav ? "⭐" : "☆"}</button>
      <strong>${esc(s.title)}</strong>
      <div class="meta">${esc(s.code || "")} · ${s.date ? esc(dayLabel(s.date)) : ""} ${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""}<br>📍 ${esc(s.venue || "")}${s.room ? " · " + esc(s.room) : ""}</div>
    </div>`;
  },

  groupedByVenueHTML(list) {
    if (!list.length) return `<div class="empty-state">조건에 맞는 세션이 없어요</div>`;
    const groups = {};
    list.forEach((s) => {
      const v = s.venue || "장소 미정";
      (groups[v] = groups[v] || []).push(s);
    });
    const ordered = [...VENUES.filter((v) => groups[v]), ...Object.keys(groups).filter((v) => !VENUES.includes(v)).sort()];
    return ordered.map((v) => `
      <h3 style="margin:14px 0 6px;">📍 ${esc(v)} <span class="muted" style="font-size:12px;font-weight:400;">${groups[v].length}개</span></h3>
      ${groups[v].slice(0, 100).map((s) => this.cardHTML(s)).join("")}
    `).join("");
  },

  setReservation(id, status) {
    S().reservations[id] = { status, updated_at: new Date().toISOString() };
    Store.save(); Views.sessions();
    toast(status === "reserved" ? "예약됨으로 표시했어요" : status === "waitlist" ? "대기로 표시했어요" : "미예약으로 표시했어요");
  },

  openDetail(id) {
    const s = this.all().find((x) => x.session_id === id);
    if (!s) return;
    const fav = S().favorites.includes(id);
    const res = (S().reservations[id] || {}).status || "none";
    const fmtMap = { lecture: "이론", "hands-on": "실습", lab: "랩", discussion: "토론형" };
    const delMap = { "in-person": "현장만", livestream: "라이브스트림", recorded: "다시보기" };
    openModal(`
      <button class="fav-btn ${fav ? "on" : ""}" id="d-fav" style="font-size:24px;">${fav ? "⭐" : "☆"}</button>
      <h2 style="padding-right:40px;">${esc(s.title)}</h2>
      <div style="margin:6px 0;">
        <span class="badge">${esc(s.code || "")}</span>
        <span class="badge info">${esc(s.session_type || "")}</span>
        ${s.level ? `<span class="badge">Lv.${esc(s.level)}</span>` : ""}
        ${s.session_format ? `<span class="badge">${esc(fmtMap[s.session_format] || s.session_format)}</span>` : ""}
        ${s.delivery ? `<span class="badge">${esc(delMap[s.delivery] || s.delivery)}</span>` : ""}
      </div>
      <div class="muted" style="font-size:13px;margin-bottom:8px;">
        ${s.date ? esc(dayLabel(s.date)) + " " : ""}${esc(s.start_time || "")}${s.end_time ? "–" + esc(s.end_time) : ""} (현지)
        ${kstRange(s.date, s.start_time, s.end_time) ? `<br>🇰🇷 한국 ${kstRange(s.date, s.start_time, s.end_time)}` : ""}
        ${s.venue ? `<br>📍 ${esc(s.venue)}${s.room ? " · " + esc(s.room) : ""}` : ""}
        ${s.speakers && s.speakers.length ? `<br>🎙️ ${esc(s.speakers.join(", "))}` : ""}
      </div>
      ${s.abstract ? `<p style="font-size:14px;">${esc(s.abstract)}</p>` : ""}
      ${(s.topics || []).length ? `<div class="chip-row">${s.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
      ${s.prerequisites ? `<div class="kv"><span>사전 준비물</span><b>${esc(s.prerequisites)}</b></div>` : ""}
      ${s.swag ? `<div class="kv"><span>🎁 기념품</span><b>${esc(s.swag)}</b></div>` : ""}
      ${s.language ? `<div class="kv"><span>언어</span><b>${esc(s.language)}${s.caption_translation ? " · " + esc(s.caption_translation) : ""}</b></div>` : ""}
      <h3>예약 상태 (직접 표시)</h3>
      <div class="chip-row" id="d-res">
        ${["reserved", "waitlist", "none"].map((v) => `<button class="chip${res === v ? " on" : ""}" data-v="${v}">${v === "reserved" ? "예약됨" : v === "waitlist" ? "대기" : "미예약"}</button>`).join("")}
      </div>
      ${((s.catalog_url || APP_DATA.catalog_url)) ? `<a class="btn ghost block" href="${esc(s.catalog_url || APP_DATA.catalog_url)}" target="_blank" rel="noopener">공식 카탈로그에서 상세 보기</a>` : ""}
      <a class="btn accent block" href="https://registration.awsevents.com/" target="_blank" rel="noopener">AWS Events 앱에서 예약하기</a>
      <button class="btn ghost block" id="d-close">닫기</button>`);
    $("#d-fav").onclick = (e) => { e.stopPropagation(); closeModal(); this.toggleFav(id); };
    $$("#d-res .chip").forEach((c) => c.onclick = () => { closeModal(); this.setReservation(id, c.dataset.v); });
    $("#d-close").onclick = closeModal;
  },

  termBodyHTML() {
    const hits = Sessions.q.trim() ? Sessions.termSearch(Sessions.q) : [];
    if (Sessions.q.trim() && Sessions._lastRecorded !== Sessions.q) {
      Sessions.recordSearch(Sessions.q, "term", hits.length);
      Sessions._lastRecorded = Sessions.q;
    }
    return hits.length ? hits.map((h) => `
      <div class="card session-card" data-hit='${esc(JSON.stringify(h))}'>
        <span class="badge ${h.kind === "세션" ? "info" : ""}">${h.kind}</span>
        <strong>${esc(h.title)}</strong><div class="muted">${esc(h.sub)}</div>
      </div>`).join("")
      : (Sessions.q.trim() ? `<div class="empty-state">검색 결과가 없어요</div>`
        : `<div class="card"><h3>최근 검색</h3>${Sessions.historyHTML()}</div>`);
  },
  termSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    this.all().forEach((s) => {
      const hay = `${s.title} ${(s.abstract || "")}`.toLowerCase();
      if (hay.includes(q)) hits.push({ kind: "세션", title: s.title, sub: `${s.code || ""} · ${s.date || ""}`, id: s.session_id });
    });
    (window.APP_DATA.prep_sections || []).forEach((sec) => {
      const text = sec.html.replace(/<[^>]+>/g, " ");
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const snip = text.slice(Math.max(0, idx - 40), idx + 90).replace(/\s+/g, " ");
        hits.push({ kind: "가이드", title: sec.title, sub: "…" + snip + "…", sec: sec.id });
      }
    });
    // shuttle + venues from event_info
    const sh = window.APP_DATA.event_info.shuttle;
    if (sh && sh.note && sh.note.toLowerCase().includes(q))
      hits.push({ kind: "가이드", title: "베뉴 간 셔틀", sub: sh.note.slice(0, 120), tab: "planner" });
    (window.APP_DATA.event_info.venues || []).forEach((v) => {
      if ((v.name + " " + (v.address || "")).toLowerCase().includes(q))
        hits.push({ kind: "가이드", title: v.name, sub: v.address || "", tab: "planner" });
    });
    return hits.slice(0, 50);
  },
  recordSearch(query, scope, count) {
    S().search_history.unshift({ query, scope, at: new Date().toISOString(), result_count: count });
    S().search_history = S().search_history.slice(0, 50);
    Store.save();
  }
};

Views.sessions = function () {
  const el = $("#view-sessions");
  const modeBtns = `
    <div class="chip-row">
      <button class="chip${Sessions.mode === "session" ? " on" : ""}" data-m="session">세션</button>
      <button class="chip${Sessions.mode === "term" ? " on" : ""}" data-m="term">용어</button>
      ${Sessions.mode === "session" ? `<button class="chip${Sessions.venueGroup ? " on" : ""}" id="ss-venue-group">📍 베뉴별</button>` : ""}
    </div>`;
  const searchBox = `<input type="text" id="ss-q" placeholder="${Sessions.mode === "term" ? "용어 검색 (예: 셔틀, ESTA, re:Play)" : "세션 검색 (제목·코드·연사)"}" value="${esc(Sessions.q)}">`;

  if (Sessions.pending()) {
    const body = Sessions.mode === "term" ? Sessions.termBodyHTML() : `
      <div class="empty-state"><div class="big">📡</div>
        <h3>세션 카탈로그 수집 대기 중</h3>
        <p>세션 목록을 가져오지 못했어요.<br>공식 카탈로그에서 다시 수집하면<br>여기에 2,000개+ 세션이 표시됩니다.</p>
      </div>
      <div class="card"><h3>최근 검색</h3>${Sessions.historyHTML()}</div>`;
    el.innerHTML = `${modeBtns}${searchBox}${body}`;
    bindSessionChrome();
    bindHitCards();
    return;
  }

  const list = Sessions.filtered();
  const venues = [...new Set(Sessions.all().map((s) => s.venue).filter(Boolean))].sort();
  const types = [...new Set(Sessions.all().map((s) => s.session_type).filter(Boolean))].sort();
  const topics = (window.APP_DATA.topics.topics || []);
  const dates = [...new Set(Sessions.all().map((s) => s.date).filter(Boolean))].sort();
  const sel = (id, opts, val, label) => `
    <select id="${id}"><option value="">${label}</option>
    ${opts.map((o) => `<option value="${esc(o)}"${String(o) === String(val) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;

  let body = "";
  if (Sessions.mode === "term") {
    body = Sessions.termBodyHTML();
  } else {
    body = `
      <div class="row">
        <div>${sel("f-date", dates, Sessions.f.date, "날짜")}</div>
        <div>${sel("f-venue", venues, Sessions.f.venue, "베뉴")}</div>
      </div>
      <div class="row">
        <div>${sel("f-type", types, Sessions.f.type, "타입")}</div>
        <div>${sel("f-level", ["100", "200", "300", "400"], Sessions.f.level, "레벨")}</div>
      </div>
      <div class="row"><div>${sel("f-topic", topics, Sessions.f.topic, "토픽")}</div></div>
      <div class="muted" style="margin:4px 0 8px;">${list.length}개 세션${Sessions.venueGroup ? " · 베뉴별" : ""}</div>
      ${Sessions.venueGroup ? Sessions.groupedByVenueHTML(list) : list.slice(0, 200).map((s) => Sessions.cardHTML(s)).join("") || `<div class="empty-state">조건에 맞는 세션이 없어요</div>`}`;
  }

  el.innerHTML = `${modeBtns}${searchBox}${body}`;
  bindSessionChrome();
  bindHitCards();
};

function bindHitCards() {
  $$("#view-sessions .session-card[data-id]").forEach((c) => c.addEventListener("click", (e) => {
    if (e.target.dataset.fav) return;
    Sessions.openDetail(c.dataset.id);
  }));
  $$("#view-sessions [data-fav]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation(); Sessions.toggleFav(b.dataset.fav);
  }));
  $$("#view-sessions .session-card[data-hit]").forEach((c) => c.addEventListener("click", () => {
    const h = JSON.parse(c.dataset.hit);
    if (h.kind === "세션") Sessions.openDetail(h.id);
    else if (h.tab) switchTab(h.tab);
    else { switchTab("prep"); setTimeout(() => Prep.openSection(h.sec), 100); }
  }));
}

function bindSessionChrome() {
  $$("#view-sessions [data-m]").forEach((b) => b.onclick = () => { Sessions.mode = b.dataset.m; Sessions.q = ""; Views.sessions(); });
  const vg = $("#ss-venue-group");
  if (vg) vg.onclick = () => { Sessions.venueGroup = !Sessions.venueGroup; Views.sessions(); };
  const q = $("#ss-q");
  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { Sessions.q = q.value; Views.sessions(); const nq = $("#ss-q"); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }, 500); });
  ["f-date", "f-venue", "f-type", "f-level", "f-topic"].forEach((id) => {
    const s = document.getElementById(id);
    if (s) s.onchange = () => { Sessions.f[id.slice(2)] = s.value; Views.sessions(); };
  });
}

Sessions.historyHTML = function () {
  const h = S().search_history;
  if (!h.length) return `<p class="muted">아직 검색 기록이 없어요</p>`;
  return h.slice(0, 10).map((x, i) => `
    <div class="kv"><span>🔍 ${esc(x.query)} <span class="badge">${x.scope === "term" ? "용어" : "세션"}</span></span>
    <span class="muted">${x.result_count}건 <button class="btn ghost small" data-hdel="${i}">삭제</button></span></div>`).join("") +
    `<button class="btn ghost small" id="h-clear" style="margin-top:8px;">기록 전체 삭제</button>`;
};

// history delete (event delegation)
document.addEventListener("click", (e) => {
  const del = e.target.closest("[data-hdel]");
  if (del) { S().search_history.splice(Number(del.dataset.hdel), 1); Store.save(); Views.sessions(); }
  if (e.target.id === "h-clear") { S().search_history = []; Store.save(); Views.sessions(); }
});
