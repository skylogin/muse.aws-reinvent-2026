/* 사전준비 탭: 내 출장 정보 + 가이드 + 준비물 체크리스트 */
"use strict";

/* 다녀온 사람들 후기 링크 */
const REINVENT_REVIEWS = [
  { title: "NDS 초보자 세션 공략집", desc: "세션 예약 순서·타입별 실전 후기", url: "https://tech.cloud.nongshim.co.kr/blog/aws/3537/" },
  { title: "SpoonLabs 현장 후기", desc: "핸즈온 주의사항·식사·꿀팁", url: "https://medium.com/spoontech/2025-aws-re-invent-ai-%EB%8C%80%EA%B2%A9%EB%8F%99-%EC%8B%9C%EB%8C%80-2496cd24ed0d" },
  { title: "re:Invent 2025 뽕뽑기 후기", desc: "호텔·물가·맛집 팁", url: "https://medium.com/@hjinblog/aws-reinvent-2025-%EC%9D%B4%EB%A0%87%EA%B9%8C%EC%A7%80-%EB%BD%95%EC%9D%84-%EB%BD%91%EC%9D%84-%EC%A4%84%EC%9D%80-d8da6519f153" },
  { title: "re:Invent 생존 가이드 (영문)", desc: "준비물 체크리스트·서바이벌 팁", url: "https://jimmydqv.com/how-to-reinvent-ep-4-packing-and-survival/" },
  { title: "re:Invent Queens 가이드 (영문)", desc: "다회 참석자들의 실전 팁 모음", url: "https://suzanamelo.com/articles/reinvent-queens-guide/" }
];

Views.prep = function () {
  const el = $("#view-prep");
  const t = S().trip;
  const f = t.flights, h = t.hotel;
  const missing = (v) => !v ? `<span class="badge warn">미정</span>` : esc(v);
  const cl = Packing.list();
  const done = cl.filter((x) => x.done).length;
  const dd = dday();
  const dtasks = DepartTasks.all();
  const dDone = S().depart_done || {};
  const dtDoneCount = dtasks.filter((x) => dDone[x.id]).length;

  el.innerHTML = `
    <div class="card"><h3>🗓️ 출발 전 할 일 <span class="badge ${dd <= 7 ? "warn" : "info"}">${dd > 0 ? `D-${dd}` : dd === 0 ? "D-Day" : `D+${-dd}`}</span></h3>
      <div class="progress${dtDoneCount === dtasks.length ? " done" : ""}"><div style="width:${Math.round(dtDoneCount / dtasks.length * 100)}%"></div></div>
      <div class="muted" style="font-size:12px;margin-bottom:6px;">${dtDoneCount}/${dtasks.length} 완료</div>
      ${dtasks.map((x) => {
        const urgent = dd <= x.d;
        const isDone = !!dDone[x.id];
        return `<label class="check-item${isDone ? " done" : ""}">
          <input type="checkbox" data-dt="${x.id}" ${isDone ? "checked" : ""}>
          <span><span class="badge ${urgent && !isDone ? "warn" : ""}">D-${x.d}</span> ${esc(x.text)}</span>
        </label>`;
      }).join("")}
    </div>

    <div class="card"><h3>✈️ 내 출장 정보</h3>
      <h4 style="margin:8px 0 4px;font-size:14px;">가는 편 (ICN → LAS) ${missing(f.outbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.outbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.outbound.dep_time ? esc(f.outbound.dep_time) + " → " + esc(f.outbound.arr_time) : "-"}</b></div>
      <h4 style="margin:8px 0 4px;font-size:14px;">오는 편 (LAS → ICN) ${missing(f.inbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.inbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.inbound.dep_time ? esc(f.inbound.dep_time) + " → " + esc(f.inbound.arr_time) : "-"}</b></div>
      <h4 style="margin:8px 0 4px;font-size:14px;">호텔 ${missing(h.name)}</h4>
      <div class="kv"><span>호텔명</span><b>${esc(h.name) || "-"}</b></div>
      <div class="kv"><span>체크인 → 아웃</span><b>${h.check_in ? esc(h.check_in) + " → " + esc(h.check_out) : "-"}</b></div>
      <button class="btn ghost block" id="prep-edit-trip">출장 정보 입력/수정</button>
    </div>

    <div class="card"><h3>🎒 준비물 체크리스트</h3>
      <div class="progress${cl.length && done === cl.length ? " done" : ""}"><div style="width:${cl.length ? Math.round(done / cl.length * 100) : 0}%"></div></div>
      <div class="muted" style="font-size:12px;margin-bottom:6px;">${done}/${cl.length} 완료</div>
      ${cl.map((c) => `<div class="check-item${c.done ? " done" : ""}">
        <label class="grow"><input type="checkbox" data-ck="${c.id}" ${c.done ? "checked" : ""}><span>${esc(c.item)}</span></label>
        <span class="row-actions">
          <button class="icon-btn" data-ckedit="${c.id}" title="수정" aria-label="수정">✏️</button>
          <button class="icon-btn" data-ckdel="${c.id}" title="삭제" aria-label="삭제">🗑️</button>
        </span>
      </div>`).join("")}
      <button class="btn ghost block small" id="ck-add" style="margin-top:8px;">＋ 항목 추가</button>
    </div>

    <div class="card"><h3>📖 출장 가이드</h3>
      ${(window.APP_DATA.prep_sections || []).map((s, i) => `
        <button class="btn ghost block left info-btn" data-guide="${i}">📘 ${esc(s.title)}</button>`).join("")}
    </div>

    <div class="card"><h3>✍️ 다녀온 사람들 후기</h3>
      <p class="muted" style="font-size:13px;">작년·재작년 참석자들의 실전 팁 모음이에요.</p>
      ${REINVENT_REVIEWS.map((r) => `
        <a class="btn ghost block left info-btn" href="${r.url}" target="_blank" rel="noopener">🔗 ${esc(r.title)}<br><span class="muted" style="font-size:12px;font-weight:400;">${esc(r.desc)}</span></a>`).join("")}
    </div>`;

  $$("#view-prep [data-dt]").forEach((c) => c.onchange = () => DepartTasks.toggle(c.dataset.dt));
  $$("#view-prep [data-guide]").forEach((b) => b.onclick = () => {
    const s = (window.APP_DATA.prep_sections || [])[Number(b.dataset.guide)];
    if (s) openDrawer(s.title, s.html);
  });
  $$("#view-prep [data-ck]").forEach((c) => c.onchange = () => {
    const item = Packing.list().find((x) => x.id === c.dataset.ck);
    if (item) { item.done = c.checked; Store.save(); Views.prep(); }
  });
  $$("#view-prep [data-ckedit]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Packing.editItem(b.dataset.ckedit); });
  $$("#view-prep [data-ckdel]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); Packing.askDelete(b.dataset.ckdel); });
  const ckAdd = $("#ck-add");
  if (ckAdd) ckAdd.onclick = () => Packing.editItem(null);
  $("#prep-edit-trip").onclick = Prep.editTrip;
};

const Prep = {
  editTrip() {
    const t = S().trip, f = t.flights, h = t.hotel;
    const inp = (id, val, ph, type) => `<input type="${type || "text"}" id="${id}" value="${esc(val)}" placeholder="${ph}">`;
    openModal(`
      <h2>출장 정보 입력</h2>
      <h3>가는 편 (ICN → LAS)</h3>
      <div class="row"><div><label class="field">항공사</label>${inp("tr-ob-al", f.outbound.airline, "예: 대한항공")}</div>
      <div><label class="field">편명</label>${inp("tr-ob-no", f.outbound.flight_no, "예: KE005")}</div></div>
      <div class="row"><div><label class="field">출발 (현지시간)</label>${inp("tr-ob-dep", f.outbound.dep_time, "2026-11-29 19:00", "text")}</div>
      <div><label class="field">도착 (현지시간)</label>${inp("tr-ob-arr", f.outbound.arr_time, "2026-11-29 13:00", "text")}</div></div>
      <h3>오는 편 (LAS → ICN)</h3>
      <div class="row"><div><label class="field">항공사</label>${inp("tr-ib-al", f.inbound.airline, "예: 대한항공")}</div>
      <div><label class="field">편명</label>${inp("tr-ib-no", f.inbound.flight_no, "예: KE006")}</div></div>
      <div class="row"><div><label class="field">출발 (현지시간)</label>${inp("tr-ib-dep", f.inbound.dep_time, "2026-12-05 11:00", "text")}</div>
      <div><label class="field">도착 (현지시간)</label>${inp("tr-ib-arr", f.inbound.arr_time, "2026-12-06 16:00", "text")}</div></div>
      <h3>호텔</h3>
      <label class="field">호텔명</label>${inp("tr-ht-name", h.name, "예: The Venetian")}
      <div class="row"><div><label class="field">체크인</label>${inp("tr-ht-in", h.check_in, "2026-11-29", "date")}</div>
      <div><label class="field">체크아웃</label>${inp("tr-ht-out", h.check_out, "2026-12-05", "date")}</div></div>
      <label class="field">주소</label>${inp("tr-ht-addr", h.address, "선택")}
      <button class="btn block" id="tr-save">저장</button>
      <button class="btn ghost block" id="tr-cancel">취소</button>`);
    $("#tr-save").onclick = () => {
      const g = (id) => $("#" + id).value.trim();
      f.outbound = { airline: g("tr-ob-al"), flight_no: g("tr-ob-no"), dep_time: g("tr-ob-dep"), arr_time: g("tr-ob-arr"), terminal: "" };
      f.inbound = { airline: g("tr-ib-al"), flight_no: g("tr-ib-no"), dep_time: g("tr-ib-dep"), arr_time: g("tr-ib-arr"), terminal: "" };
      t.hotel = { name: g("tr-ht-name"), check_in: g("tr-ht-in"), check_out: g("tr-ht-out"), address: g("tr-ht-addr") };
      Store.save(); closeModal(); Views.prep(); toast("출장 정보를 저장했어요");
    };
    $("#tr-cancel").onclick = closeModal;
  },
  openSection(secId) {
    const s = (window.APP_DATA.prep_sections || []).find((x) => x.id === secId);
    if (s) openDrawer(s.title, s.html);
  }
};
