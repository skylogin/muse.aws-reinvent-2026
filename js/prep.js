/* 사전준비 탭: 내 여행 정보 + 가이드 + 준비물 체크리스트 */
"use strict";

Views.prep = function () {
  const el = $("#view-prep");
  const t = S().trip;
  const f = t.flights, h = t.hotel;
  const missing = (v) => !v ? `<span class="badge warn">미정</span>` : esc(v);
  const cl = Packing.list();
  const done = cl.filter((x) => x.done).length;

  el.innerHTML = `
    <div class="card"><h3>✈️ 내 여행 정보</h3>
      <h4 style="margin:8px 0 4px;font-size:14px;">가는 편 (ICN → LAS) ${missing(f.outbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.outbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.outbound.dep_time ? esc(f.outbound.dep_time) + " → " + esc(f.outbound.arr_time) : "-"}</b></div>
      <h4 style="margin:8px 0 4px;font-size:14px;">오는 편 (LAS → ICN) ${missing(f.inbound.flight_no)}</h4>
      <div class="kv"><span>편명</span><b>${esc(f.inbound.flight_no) || "-"}</b></div>
      <div class="kv"><span>출발 → 도착</span><b>${f.inbound.dep_time ? esc(f.inbound.dep_time) + " → " + esc(f.inbound.arr_time) : "-"}</b></div>
      <h4 style="margin:8px 0 4px;font-size:14px;">호텔 ${missing(h.name)}</h4>
      <div class="kv"><span>호텔명</span><b>${esc(h.name) || "-"}</b></div>
      <div class="kv"><span>체크인 → 아웃</span><b>${h.check_in ? esc(h.check_in) + " → " + esc(h.check_out) : "-"}</b></div>
      <button class="btn ghost block" id="prep-edit-trip">여행 정보 입력/수정</button>
    </div>

    <div class="card"><h3>🎒 준비물 체크리스트</h3>
      <div class="progress"><div style="width:${Math.round(done / cl.length * 100)}%"></div></div>
      <div class="muted" style="font-size:12px;margin-bottom:6px;">${done}/${cl.length} 완료</div>
      ${cl.map((c) => `<label class="check-item${c.done ? " done" : ""}"><input type="checkbox" data-ck="${c.id}" ${c.done ? "checked" : ""}><span>${esc(c.item)}</span></label>`).join("")}
    </div>

    <div class="card"><h3>📖 여행 가이드</h3>
      ${(window.APP_DATA.prep_sections || []).map((s, i) => `
        <div class="accordion" id="acc-${s.id}">
          <button data-acc="${i}"><span>${esc(s.title)}</span><span>▾</span></button>
          <div class="acc-body">${s.html}</div>
        </div>`).join("")}
    </div>`;

  $$("#view-prep [data-acc]").forEach((b) => b.onclick = () => b.closest(".accordion").classList.toggle("open"));
  $$("#view-prep [data-ck]").forEach((c) => c.onchange = () => {
    const item = Packing.list().find((x) => x.id === c.dataset.ck);
    if (item) { item.done = c.checked; Store.save(); Views.prep(); }
  });
  $("#prep-edit-trip").onclick = Prep.editTrip;
};

const Prep = {
  editTrip() {
    const t = S().trip, f = t.flights, h = t.hotel;
    const inp = (id, val, ph, type) => `<input type="${type || "text"}" id="${id}" value="${esc(val)}" placeholder="${ph}">`;
    openModal(`
      <h2>여행 정보 입력</h2>
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
      Store.save(); closeModal(); Views.prep(); toast("여행 정보를 저장했어요");
    };
    $("#tr-cancel").onclick = closeModal;
  },
  openSection(secId) {
    const acc = document.getElementById("acc-" + secId);
    if (acc) { acc.classList.add("open"); acc.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }
};
