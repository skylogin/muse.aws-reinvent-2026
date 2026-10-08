/* 정산 탭: 회사/개인 구분 지출 기록 */
"use strict";

const EXP_CATS = { flight: "항공", hotel: "호텔", meal: "식사", transport: "교통", etc: "기타" };
let expFilter = "all"; // all | company | personal

Views.expenses = function () {
  const el = $("#view-expenses");
  const list = S().expenses.filter((e) => expFilter === "all" || e.owner === expFilter);
  const sum = (own) => S().expenses.filter((e) => e.owner === own)
    .reduce((a, e) => ({ usd: a.usd + (+e.amount_usd || 0), krw: a.krw + (+e.amount_krw || 0) }), { usd: 0, krw: 0 });
  const sc = sum("company"), sp = sum("personal");
  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const budget = +S().budget_usd || 0;
  const totalUsd = sc.usd + sp.usd;
  const pct = budget > 0 ? Math.min(Math.round(totalUsd / budget * 100), 100) : 0;
  const budgetMsg = budget > 0
    ? (totalUsd >= budget
        ? `<div class="danger-box">⚠️ 예산을 초과했어요! ($${fmt(totalUsd)} / $${fmt(budget)})</div>`
        : totalUsd >= budget * 0.8
          ? `<div class="warn-box">예산의 ${Math.round(totalUsd / budget * 100)}%를 사용했어요 ($${fmt(totalUsd)} / $${fmt(budget)})</div>`
          : `<div class="muted" style="font-size:13px;">$${fmt(totalUsd)} / $${fmt(budget)} (${Math.round(totalUsd / budget * 100)}% 사용)</div>`)
    : `<div class="muted" style="font-size:13px;">예산을 설정하면 지출을 관리할 수 있어요.</div>`;

  el.innerHTML = `
    <div class="card"><h3>💰 예산</h3>
      <div class="progress"><div style="width:${pct}%"></div></div>
      ${budgetMsg}
      <button class="btn ghost small" id="ex-budget" style="margin-top:6px;">예산 설정</button>
    </div>
    <div class="card">
      <div class="chip-row">
        ${[["all", "전체"], ["company", "회사"], ["personal", "개인"]].map(([v, l]) =>
          `<button class="chip${expFilter === v ? " on" : ""}" data-ef="${v}">${l}</button>`).join("")}
      </div>
      <div class="kv"><span>🏢 회사 합계</span><b>$${fmt(sc.usd)} · ₩${fmt(sc.krw)}</b></div>
      <div class="kv"><span>👤 개인 합계</span><b>$${fmt(sp.usd)} · ₩${fmt(sp.krw)}</b></div>
      <button class="btn accent block" id="ex-add">+ 지출 추가</button>
    </div>
    ${list.length ? list.slice().reverse().map((e) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${esc(e.desc) || EXP_CATS[e.category] || "지출"}</strong>
          <span class="badge ${e.owner === "company" ? "info" : ""}">${e.owner === "company" ? "회사" : "개인"}</span>
        </div>
        <div class="muted" style="font-size:13px;">${esc(e.date)} · ${esc(EXP_CATS[e.category] || e.category)}${e.receipt ? " · 🧾 영수증 있음" : ""}</div>
        <div style="font-size:17px;font-weight:700;margin-top:4px;">$${fmt(e.amount_usd)} <span class="muted" style="font-size:13px;font-weight:400;">(₩${fmt(e.amount_krw)})</span></div>
        <button class="btn ghost small" data-exdel="${e.id}" style="margin-top:6px;">삭제</button>
      </div>`).join("")
      : `<div class="empty-state"><div class="big">🧾</div><p>기록된 지출이 없어요</p></div>`}`;

  $$("#view-expenses [data-ef]").forEach((b) => b.onclick = () => { expFilter = b.dataset.ef; Views.expenses(); });
  $("#ex-add").onclick = Expenses.openForm;
  $("#ex-budget").onclick = () => {
    openModal(`
      <h2>예산 설정</h2>
      <label class="field">출장 전체 예산 (USD)</label>
      <input type="number" id="bg-usd" value="${S().budget_usd || ""}" placeholder="예: 2000" inputmode="decimal">
      <button class="btn block" id="bg-save">저장</button>
      <button class="btn ghost block" id="bg-cancel">취소</button>`);
    $("#bg-save").onclick = () => {
      S().budget_usd = +$("#bg-usd").value || 0;
      Store.save(); closeModal(); Views.expenses(); toast("예산을 저장했어요");
    };
    $("#bg-cancel").onclick = closeModal;
  };
  $$("#view-expenses [data-exdel]").forEach((b) => b.onclick = () => {
    const id = b.dataset.exdel;
    const target = S().expenses.find((e) => e.id === id);
    openModal(`
      <h2>삭제할까요?</h2>
      <p>"${esc((target && (target.desc || EXP_CATS[target.category])) || "지출")}" 기록을 삭제합니다.</p>
      <button class="btn danger block" id="ex-del-yes">삭제</button>
      <button class="btn ghost block" id="ex-cancel">취소</button>`);
    $("#ex-del-yes").onclick = () => {
      S().expenses = S().expenses.filter((e) => e.id !== id);
      Store.save(); closeModal(); Views.expenses(); toast("삭제했어요");
    };
    $("#ex-cancel").onclick = closeModal;
  });
};

const Expenses = {
  openForm() {
    const today = vegasDateStr();
    openModal(`
      <h2>지출 추가</h2>
      <label class="field">날짜</label><input type="date" id="ex-date" value="${today}">
      <label class="field">구분</label>
      <div class="chip-row" id="ex-owner">
        <button class="chip on" data-v="company">🏢 회사</button>
        <button class="chip" data-v="personal">👤 개인</button>
      </div>
      <label class="field">카테고리</label>
      <select id="ex-cat">${Object.entries(EXP_CATS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <label class="field">내용</label><input type="text" id="ex-desc" placeholder="예: 호텔 조식">
      <div class="row">
        <div><label class="field">금액 (USD)</label><input type="number" id="ex-usd" placeholder="0" inputmode="decimal"></div>
        <div><label class="field">금액 (KRW)</label><input type="number" id="ex-krw" placeholder="자동 계산" inputmode="numeric"></div>
      </div>
      <div class="muted" style="font-size:12px;margin:-6px 0 8px;">환율: $1 = ₩<span id="ex-rate">${S().fx_rate}</span> <button class="btn ghost small" id="ex-rate-edit">변경</button></div>
      <label class="check-item"><input type="checkbox" id="ex-receipt"><span>영수증 보관함</span></label>
      <button class="btn block" id="ex-save">저장</button>
      <button class="btn ghost block" id="ex-cancel">취소</button>`);
    let owner = "company";
    $$("#ex-owner .chip").forEach((c) => c.onclick = () => {
      owner = c.dataset.v;
      $$("#ex-owner .chip").forEach((x) => x.classList.toggle("on", x === c));
    });
    $("#ex-usd").addEventListener("input", (e) => {
      const krw = $("#ex-krw");
      if (!krw.value) krw.value = Math.round((+e.target.value || 0) * S().fx_rate);
    });
    $("#ex-rate-edit").onclick = () => {
      const v = prompt("환율 ($1 = ₩)", S().fx_rate);
      if (v && +v > 0) { S().fx_rate = +v; Store.save(); $("#ex-rate").textContent = v; }
    };
    $("#ex-save").onclick = () => {
      const usd = +$("#ex-usd").value || 0;
      let krw = +$("#ex-krw").value || 0;
      if (!krw && usd) krw = Math.round(usd * S().fx_rate);
      S().expenses.push({
        id: "ex" + Date.now(), date: $("#ex-date").value, owner,
        category: $("#ex-cat").value, desc: $("#ex-desc").value.trim(),
        amount_usd: usd, amount_krw: krw,
        receipt: $("#ex-receipt").checked
      });
      Store.save(); closeModal(); Views.expenses(); toast("지출을 기록했어요");
    };
    $("#ex-cancel").onclick = closeModal;
  }
};
