/* 동선 탭: 베뉴 지도/링크, 셔틀, 공항 이동 */
"use strict";

const TAXI_ZONE = {
  "MGM Grand": "Zone 1 · $21.25",
  "Caesars Palace": "Zone 2 · $25.25",
  "Wynn": "Zone 3 · $29.25"
};

Views.transport = function () {
  const el = $("#view-transport");
  const venues = window.APP_DATA.event_info.venues || [];
  const shuttle = window.APP_DATA.event_info.shuttle || {};
  const airportSec = (window.APP_DATA.prep_sections || []).find((s) => s.id.includes("공항"));

  el.innerHTML = `
    <div class="card"><h3>🗺️ 베뉴 6곳</h3>
      ${venues.map((v) => `
        <div class="kv"><span><strong>${esc(v.name)}</strong><br>
          <span class="muted" style="font-size:12px;">${esc(v.address || "")}${TAXI_ZONE[v.name] ? `<br>택시 ${esc(TAXI_ZONE[v.name])}` : ""}</span></span>
          <a class="btn ghost small" target="_blank" rel="noopener"
             href="https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}">지도</a>
        </div>`).join("")}
    </div>
    <div class="card"><h3>🚌 베뉴 간 셔틀</h3>
      <p style="font-size:14px;">${esc(shuttle.note || "베뉴 간 셔틀 운행 (배지 필수)")}</p>
      <span class="badge warn">시간표 미공개</span>
      <p class="muted" style="font-size:13px;">세부 노선·시간표는 가을 중 공개 예정 — 출발 직전 AWS Events 앱에서 확인하세요.</p>
      <div class="notice">💡 배지 제시로 <strong>라스베가스 모노레일 무료</strong> (SAHARA ↔ MGM Grand, 공항 미연결)</div>
    </div>
    <div class="card"><h3>✈️ 공항 → 호텔 이동</h3>
      ${airportSec ? airportSec.html : `<p class="muted">가이드 준비 중</p>`}
    </div>
    <div class="card"><h3>전략 팁</h3>
      <p style="font-size:14px;">세션을 <strong>베뉴 블록 단위</strong>로 묶고, 세션 사이 <strong>최소 40분</strong> 여유를 두세요.
      내 일정 탭에서 베뉴가 바뀌면 이동 시간·수단을 자동으로 계산해 줍니다.</p>
    </div>`;
};
