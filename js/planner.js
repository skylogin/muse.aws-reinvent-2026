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

  renderTimeline(date) {
    const items = this.itemsFor(date);
    if (!items.length) return `<div class="empty-state"><div class="big">🗓️</div><p>이 날의 일정이 비어 있어요.<br>세션 탭에서 관심 세션을 담아보세요.</p></div>`;
    let html = "";
    items.forEach((it, i) => {
      html += this.itemHTML(it);
      const nxt = items[i + 1];
      if (nxt) {
        const tr = this.travelBetween(it, nxt);
        if (tr) {
          const endMin = this.toMin(it.end || it.end_time);
          const startMin = this.toMin(nxt.start || nxt.start_time);
          const gap = (endMin != null && startMin != null) ? startMin - endMin : null;
          const impossible = gap != null && gap < tr.minutes;
          html += `<div class="travel-block${impossible ? " impossible" : ""}">
            🚶 ${esc(tr.label)}
            ${tr.maps ? `<br><a href="${tr.maps}" target="_blank" rel="noopener" style="font-size:12px;">Google Maps에서 길찾기</a>` : ""}
            ${impossible ? `<div class="danger-box" style="margin:6px 0 0;">⚠️ 이동에 ${tr.minutes}분이 필요하지만 간격이 ${gap}분입니다.
              <br>· 앞 세션을 일찍 나오기<br>· 뒤 세션을 백업으로 교체<br>· 같은 베뉴의 다른 세션 찾아보기</div>` : ""}
          </div>`;
        }
      }
    });
    return html;
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

  exportICS() {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//reinvent2026//trip//KO"];
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
    <div id="pl-timeline">${Planner.renderTimeline(plannerDay)}</div>
    <div class="card"><h3>고정 이벤트 표시</h3>
      ${FIXED_EVENTS.filter((f) => f.date === plannerDay).map((f) => `
        <label class="check-item"><input type="checkbox" data-fx="${f.id}" ${S().fixed_off.includes(f.id) ? "" : "checked"}>
        <span>${esc(f.start)} ${esc(f.title)} <span class="muted">· ${esc(f.venue)}</span></span></label>`).join("") || `<p class="muted">이 날의 고정 이벤트가 없어요</p>`}
    </div>
    <button class="btn ghost block" id="pl-ics">📅 ICS로 내보내기 (캘린더 연동)</button>`;
  $$("#view-planner [data-day]").forEach((b) => b.onclick = () => { plannerManual = true; plannerDay = b.dataset.day; Views.planner(); });
  $$("#view-planner [data-fx]").forEach((c) => c.onchange = () => Planner.toggleFixed(c.dataset.fx));
  $("#pl-ics").onclick = () => Planner.exportICS();
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
