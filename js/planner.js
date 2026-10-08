/* 내 일정 탭: 스마트 플래너 — 타임라인, 이동 계산, 고정 이벤트, 메모, ICS */
"use strict";

const DAYS = ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"];
let plannerDay = null;
let plannerManual = false; // true면 사용자가 직접 고른 날짜 유지
function todayClamped() {
  const t = vegasDateStr();
  if (t < DAYS[0]) return DAYS[0];
  if (t > DAYS[DAYS.length - 1]) return DAYS[DAYS.length - 1];
  return t;
}

/* 공식 카탈로그 베뉴 표기 → event_info 베뉴명 매핑 (좌표 조회용) */
const VENUE_ALIASES = { "Wynn/Encore": "Wynn", "Venetian": "The Venetian" };

const Planner = {
  sessionById(id) { return allSessions().find((s) => s.session_id === id); },

  itemsFor(date) {
    const items = [];
    FIXED_EVENTS.filter((f) => f.date === date && !S().fixed_off.includes(f.id))
      .forEach((f) => items.push({ kind: "fixed", ...f }));
    (S().daily_plan[date] || []).forEach((p) => {
      const s = this.sessionById(p.session_id);
      if (s) items.push({ kind: "session", ...s, note: p.note });
      else items.push({ kind: "session-missing", session_id: p.session_id, date, note: p.note });
    });
    items.sort((a, b) => (a.start || a.start_time || "").localeCompare(b.start || b.start_time || ""));
    return items;
  },

  todayItems() {
    const t = vegasDateStr();
    return DAYS.includes(t) ? this.itemsFor(t) : [];
  },

  itemHTML(it) {
    const time = it.kind === "fixed"
      ? `${it.start}${it.end ? "–" + it.end : "부터"}`
      : `${it.start_time || ""}${it.end_time ? "–" + it.end_time : ""}`;
    const venue = it.venue || "";
    const badge = it.kind === "fixed" ? `<span class="badge warn">고정</span>` : `<span class="badge info">${esc(it.session_type || "세션")}</span>`;
    const note = S().session_notes[it.session_id || it.id];
    return `<div class="timeline-item" data-pitem="${esc(it.session_id || it.id)}">
      <div class="t">${esc(time)} ${venue ? "· " + esc(venue) : ""}</div>
      <div>${badge} <strong>${esc(it.title)}</strong></div>
      ${it.note || (note && note.memo) ? `<div class="muted">📝 ${esc(it.note || note.memo)}</div>` : ""}
      ${note && note.rating ? `<div class="muted">⭐ ${"★".repeat(note.rating)}</div>` : ""}
    </div>`;
  },

  /* ---- travel ---- */
  venueCoords(name) {
    const key = VENUE_ALIASES[name] || name;
    const v = (window.APP_DATA.event_info.venues || []).find((x) => x.name === key);
    return v ? { lat: v.lat, lng: v.lng } : null;
  },
  havKm(a, b) {
    const R = 6371, r = (d) => d * Math.PI / 180;
    const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },
  travelBetween(prev, next) {
    const pv = prev.venue, nv = next.venue;
    if (!pv || !nv) return null;
    if (pv === nv) return { minutes: 15, mode: "도보", label: "같은 베뉴 — 건물 내 이동 15분", maps: null };
    const a = this.venueCoords(pv), b = this.venueCoords(nv);
    if (!a || !b) return { minutes: 30, mode: "셔틀/택시", label: "베뉴 간 이동 — 여유 30분", maps: null };
    const km = this.havKm(a, b);
    let minutes, mode, label;
    if (km < 0.8) { minutes = Math.round(km / 3.5 * 60) + 10; mode = "도보"; }
    else if (km < 2) { minutes = Math.round(km / 18 * 60) + 15; mode = "셔틀/모노레일"; }
    else { minutes = Math.round(km / 22 * 60) + 15; mode = "셔틀/택시"; }
    label = `${pv} → ${nv} · 약 ${km.toFixed(1)}km · ${mode} ${minutes}분`;
    const maps = `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode === "도보" ? "walking" : "driving"}`;
    return { minutes, mode, label, maps, km };
  },
  toMin(t) { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; },

  /* ---- timetable (8:00–20:00, 1px = 1min) ---- */
  renderTimetable(date) {
    const items = this.itemsFor(date);
    const START = 8 * 60, END = 20 * 60, GUTTER = 46;
    if (!items.length) return `<div class="empty-state"><div class="big">🗓️</div><p>이 날의 일정이 비어 있어요.<br>세션 탭에서 관심 세션을 담아보세요.</p></div>`;

    const blocks = [];
    items.forEach((it) => {
      const s = this.toMin(it.start || it.start_time);
      let e = this.toMin(it.end || it.end_time);
      if (s == null) return;
      if (e == null || e <= s) e = s + 60;
      if (e <= START || s >= END) return;
      blocks.push({ it, s: Math.max(s, START), e: Math.min(e, END) });
    });

    // 겹치는 블록은 가로로 나눔
    const sorted = [...blocks].sort((a, b) => a.s - b.s || a.e - b.e);
    const colEnd = [];
    sorted.forEach((b) => {
      let c = 0;
      while (c < colEnd.length && colEnd[c] > b.s) c++;
      b.col = c; colEnd[c] = b.e;
    });
    blocks.forEach((b) => {
      let mx = b.col + 1;
      blocks.forEach((o) => { if (o !== b && o.s < b.e && b.s < o.e) mx = Math.max(mx, o.col + 1); });
      b.cols = mx;
    });

    let grid = "";
    for (let h = 8; h <= 20; h++) {
      grid += `<div class="tt-hour" style="top:${h * 60 - START}px"><span>${h}:00</span></div>`;
    }

    let html = grid;
    blocks.forEach((b) => {
      const top = b.s - START;
      const hgt = Math.max(b.e - b.s, 46);
      const left = `calc(${GUTTER}px + (100% - ${GUTTER}px) * ${b.col / b.cols})`;
      const width = `calc((100% - ${GUTTER}px) / ${b.cols} - 6px)`;
      const kind = b.it.kind === "fixed" ? "fixed" : "session";
      const time = `${b.it.start || b.it.start_time || ""}${(b.it.end || b.it.end_time) ? "–" + (b.it.end || b.it.end_time) : ""}`;
      const kst = kstRange(date, b.it.start || b.it.start_time, b.it.end || b.it.end_time);
      const note = b.it.note || (S().session_notes[b.it.session_id || b.it.id] || {}).memo;
      html += `<div class="tt-block tt-${kind}" data-pitem="${esc(b.it.session_id || b.it.id)}"
        style="top:${top}px;height:${hgt}px;left:${left};width:${width};" role="button" tabindex="0">
        <div class="tt-time">${esc(time)}</div>
        ${kst ? `<div class="tt-kst">🇰🇷${kst}</div>` : ""}
        <div class="tt-title">${b.it.kind === "fixed" ? `<span class="badge warn">고정</span> ` : ""}<strong>${esc(b.it.title)}</strong></div>
        ${b.it.venue ? `<div class="tt-venue">📍 ${esc(b.it.venue)}</div>` : ""}
        ${note ? `<div class="tt-venue">📝 ${esc(note)}</div>` : ""}
      </div>`;
    });

    // 이동 레이어: 일정 사이 간격에만 표시 (겹치면 생략)
    const ordered = [...blocks].sort((a, b) => a.s - b.s);
    ordered.forEach((b, i) => {
      const nxt = ordered[i + 1];
      if (!nxt) return;
      const gap = nxt.s - b.e;
      if (gap <= 0) return;
      const tr = this.travelBetween(b.it, nxt.it);
      if (!tr) return;
      const bad = gap < tr.minutes;
      html += `<div class="tt-travel${bad ? " bad" : ""}" style="top:${b.e - START - 11}px;left:${GUTTER + 6}px" title="${esc(tr.label)}">🚶 ${tr.minutes}분 · ${esc(tr.mode)}${bad ? " ⚠️" : ""}</div>`;
    });

    // 지금 선
    if (date === vegasDateStr()) {
      const p = vegasParts();
      const nowMin = (+p.hour) * 60 + (+p.minute);
      if (nowMin >= START && nowMin <= END) {
        html += `<div class="tt-now" style="top:${nowMin - START}px"><span>지금</span></div>`;
      }
    }

    return `<div class="tt-wrap"><div class="tt-grid" style="height:${END - START}px">${html}</div>
      <div class="tt-note muted">탭하면 상세 보기 · 🇰🇷는 한국 시간</div></div>`;
  },

  openNote(id) {
    const n = S().session_notes[id] || { rating: 0, memo: "" };
    openModal(`
      <h2>세션 메모</h2>
      <label class="field">별점</label>
      <div class="stars" id="nt-stars">${[1, 2, 3, 4, 5].map((i) => `<span data-s="${i}" class="${i <= n.rating ? "on" : ""}">★</span>`).join("")}</div>
      <label class="field">후기 / 감상평</label>
      <textarea id="nt-memo" rows="4" placeholder="배운 점, 후속 액션 등">${esc(n.memo)}</textarea>
      <button class="btn block" id="nt-save">저장</button>
      <button class="btn ghost block" id="nt-cancel">닫기</button>`);
    let rating = n.rating;
    $$("#nt-stars span").forEach((sp) => sp.onclick = () => {
      rating = Number(sp.dataset.s);
      $$("#nt-stars span").forEach((x) => x.classList.toggle("on", Number(x.dataset.s) <= rating));
    });
    $("#nt-save").onclick = () => {
      S().session_notes[id] = { rating, memo: $("#nt-memo").value.trim(), updated_at: new Date().toISOString() };
      Store.save(); closeModal(); Views.planner(); toast("메모 저장했어요");
    };
    $("#nt-cancel").onclick = closeModal;
  },

  toggleFixed(id) {
    const off = S().fixed_off;
    const i = off.indexOf(id);
    if (i >= 0) off.splice(i, 1); else off.push(id);
    Store.save(); Views.planner();
  },

  exportICS() {    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//reinvent2026//trip//KO"];
    DAYS.forEach((d) => {
      this.itemsFor(d).forEach((it) => {
        const start = it.start || it.start_time, end = it.end || it.end_time;
        if (!start) return;
        const dt = (date, t) => date.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
        lines.push("BEGIN:VEVENT", `UID:${(it.session_id || it.id)}@reinvent2026`,
          `DTSTART:${dt(d, start)}`, ...(end ? [`DTEND:${dt(d, end)}`] : []),
          `SUMMARY:${(it.title || "").replace(/\n/g, " ")}`,
          `LOCATION:${(it.venue || "").replace(/\n/g, " ")}`, "END:VEVENT");
      });
    });
    lines.push("END:VCALENDAR");
    download("reinvent2026-schedule.ics", lines.join("\r\n"), "text/calendar");
    toast("ICS 파일을 저장했어요");
  },

  printView() {
    const rows = DAYS.map((d) => {
      const items = this.itemsFor(d);
      if (!items.length) return "";
      return `<h2>${dayLabel(d)}</h2>
        <table><tr><th style="width:130px;">시간 (현지)</th><th>일정</th><th>장소</th></tr>
        ${items.map((it) => {
          const time = `${it.start || it.start_time || ""}${(it.end || it.end_time) ? "–" + (it.end || it.end_time) : ""}`;
          const kst = kstRange(d, it.start || it.start_time, it.end || it.end_time);
          return `<tr><td>${esc(time)}${kst ? `<br><span style="color:#666;">🇰🇷${kst}</span>` : ""}</td><td>${esc(it.title)}</td><td>${esc(it.venue || "")}</td></tr>`;
        }).join("")}</table>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) { toast("팝업 차단을 해제해 주세요"); return; }
    w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>re:Invent 2026 일정표</title>
      <style>body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#000;}
      h1{font-size:22px;margin:0 0 4px;}h2{font-size:16px;margin:22px 0 8px;border-bottom:2px solid #000;padding-bottom:4px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top;}
      th{background:#eee;}.meta{color:#666;font-size:12px;margin:0 0 8px;}</style></head><body>
      <h1>re:Invent 2026 출장 일정표</h1>
      <p class="meta">${esc(S().profile.nickname || "게스트")} · 현지 시간 기준</p>
      ${rows || "<p>일정이 비어 있어요.</p>"}
      <script>window.onload=function(){window.print();};<\/script>
      </body></html>`);
    w.document.close();
  }
};

/* ---- route info (drawers) ---- */
const RouteInfo = {
  taxiZone: { "MGM Grand": "Zone 1 · $21.25", "Caesars Palace": "Zone 2 · $25.25", "Wynn": "Zone 3 · $29.25" },
  venuesHTML() {
    const venues = (window.APP_DATA.event_info.venues || []);
    return `<p class="muted" style="font-size:13px;">베뉴 6곳 — 탭하면 Google Maps가 열립니다.</p>` + venues.map((v) => `
      <div class="kv"><span><strong>${esc(v.name)}</strong><br>
        <span class="muted" style="font-size:12px;">${esc(v.address || "")}${this.taxiZone[v.name] ? `<br>택시 ${esc(this.taxiZone[v.name])}` : ""}</span></span>
        <a class="btn ghost small map-btn" target="_blank" rel="noopener"
           href="https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}">📍 지도</a>
      </div>`).join("");
  },
  shuttleHTML() {
    const sh = window.APP_DATA.event_info.shuttle || {};
    return `<p style="font-size:14px;">${esc(sh.note || "베뉴 간 셔틀 운행 (배지 필수)")}</p>
      <p><span class="badge warn">시간표 미공개</span></p>
      <p class="muted" style="font-size:13px;">세부 노선·시간표는 가을 중 공개 예정 — 출발 직전 AWS Events 앱에서 확인하세요.</p>
      <div class="notice">💡 배지 제시로 <strong>라스베가스 모노레일 무료</strong> (SAHARA ↔ MGM Grand, 공항 미연결)</div>`;
  },
  airportHTML() {
    const sec = (window.APP_DATA.prep_sections || []).find((s) => s.id.includes("공항"));
    return sec ? sec.html : `<p class="muted">가이드 준비 중</p>`;
  },
  strategyHTML() {
    return `<p>세션을 <strong>베뉴 블록 단위</strong>로 묶고, 세션 사이 <strong>최소 40분</strong> 여유를 두세요.</p>
      <p>위 타임라인에서 베뉴가 바뀌면 이동 시간·수단을 자동으로 계산해 줍니다.</p>
      <p class="muted" style="font-size:13px;">다녀온 사람들 팁: 하루 일정은 <strong>베뉴 2곳(오전/오후)</strong>으로만 짜고, 이동에 1시간 여유를 두세요.</p>`;
  }
};

Views.planner = function () {
  if (!plannerManual) plannerDay = todayClamped(); // 탭을 열 때마다 현지 날짜로
  if (!DAYS.includes(plannerDay)) plannerDay = "2026-11-30";
  const el = $("#view-planner");
  el.innerHTML = `
    <div class="day-tabs">${DAYS.map((d) => {
      const w = Weather.iconFor(d);
      return `<button data-day="${d}" class="${d === plannerDay ? "active" : ""}">${dayLabel(d)}${w ? " " + w : ""}</button>`;
    }).join("")}</div>
    <div id="pl-timeline">${Planner.renderTimetable(plannerDay)}</div>
    <div class="card"><h3>🗺️ 동선 정보</h3>
      <button class="btn ghost block left info-btn" id="ri-venues">🗺️ 베뉴 6곳·지도</button>
      <button class="btn ghost block left info-btn" id="ri-shuttle">🚌 베뉴 간 셔틀</button>
      <button class="btn ghost block left info-btn" id="ri-airport">✈️ 공항 → 호텔 이동</button>
      <button class="btn ghost block left info-btn" id="ri-strategy">📌 베뉴 이동 전략</button>
    </div>
    <div class="card"><h3>고정 이벤트 표시</h3>
      ${FIXED_EVENTS.filter((f) => f.date === plannerDay).map((f) => `
        <label class="check-item"><input type="checkbox" data-fx="${f.id}" ${S().fixed_off.includes(f.id) ? "" : "checked"}>
        <span>${esc(f.start)} ${esc(f.title)} <span class="muted">· ${esc(f.venue)}</span></span></label>`).join("") || `<p class="muted">이 날의 고정 이벤트가 없어요</p>`}
    </div>
    <div class="row">
      <button class="btn ghost small" id="pl-ics">📅 ICS 내보내기</button>
      <button class="btn ghost small" id="pl-print">🖨️ 인쇄용 일정표</button>
    </div>`;
  $$("#view-planner [data-day]").forEach((b) => b.onclick = () => { plannerManual = true; plannerDay = b.dataset.day; Views.planner(); });
  $("#ri-venues").onclick = () => openDrawer("베뉴 6곳", RouteInfo.venuesHTML());
  $("#ri-shuttle").onclick = () => openDrawer("베뉴 간 셔틀", RouteInfo.shuttleHTML());
  $("#ri-airport").onclick = () => openDrawer("공항 → 호텔 이동", RouteInfo.airportHTML());
  $("#ri-strategy").onclick = () => openDrawer("베뉴 이동 전략", RouteInfo.strategyHTML());
  $$("#view-planner [data-fx]").forEach((c) => c.onchange = () => Planner.toggleFixed(c.dataset.fx));
  $("#pl-ics").onclick = () => Planner.exportICS();
  $("#pl-print").onclick = () => Planner.printView();
  $$("#pl-timeline [data-pitem]").forEach((it) => it.addEventListener("click", () => {
    const id = it.dataset.pitem;
    if (!id) return;
    openModal(`<h2>일정 항목</h2>
      <button class="btn block" id="pi-note">📝 메모 / 별점</button>
      <button class="btn ghost block" id="pi-unfav">일정에서 빼기</button>
      <button class="btn ghost block" id="pi-close">닫기</button>`);
    $("#pi-note").onclick = () => Planner.openNote(id);
    $("#pi-unfav").onclick = () => {
      const st = S();
      Object.keys(st.daily_plan).forEach((d) => { st.daily_plan[d] = (st.daily_plan[d] || []).filter((x) => x.session_id !== id); });
      const fi = st.favorites.indexOf(id); if (fi >= 0) st.favorites.splice(fi, 1);
      Store.save(); closeModal(); Views.planner();
    };
    $("#pi-close").onclick = closeModal;
  }));
};
