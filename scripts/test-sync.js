/* 기기 간 합치기 로직 단위 테스트 — node scripts/test-sync.js (배포 점검에서도 실행) */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ctx = vm.createContext({ CompressionStream, DecompressionStream, Response, Blob, TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/sync.js"), "utf8") + "\n;this.Sync = Sync;", ctx);
const Sync = ctx.Sync;
const CFG = { checklistDefaults: () => [{ id: "pk0", item: "여권", done: false }, { id: "pk1", item: "ESTA", done: false }] };
const J = (x) => JSON.stringify(x);
const eq = (a, b, m) => { if (J(a) !== J(b)) throw new Error(`${m}: ${J(a)} ≠ ${J(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const base = () => ({ profile: { nickname: "", topics: [], services: [] }, favorites: [], daily_plan: {}, reservations: {}, session_notes: {},
  expenses: [], checklist: null, trip: { hotel: { name: "", check_in: "" } }, fx_rate: 1450, theme: "system", text_scale: 1,
  sync: { stamps: {}, tombs: {} }, sync_local: { last_sent_at: null, last_received_at: null, last_received_exported_at: null, last_from: "" } });
/* Store.save()를 흉내 내는 기기: edit(fn, t)로 고치고 t 시각에 저장 */
function device(over) {
  const d = { s: Object.assign(base(), over || {}) };
  let prev = Sync.units(d.s, CFG);
  d.edit = (fn, t) => { fn(d.s); const cur = Sync.units(d.s, CFG); Sync.track(prev, cur, d.s.sync, t); prev = cur; return d; };
  d.take = (state) => { d.s = state; prev = Sync.units(d.s, CFG); return d; };
  return d;
}
const tests = [];
const test = (n, fn) => tests.push([n, fn]);

/* ---------- 단위 쪼개기 ---------- */
test("units: unit keys per collection", () => {
  const s = Object.assign(base(), {
    favorites: ["A"], daily_plan: { "2026-12-01": [{ session_id: "A", note: "" }] },
    expenses: [{ id: "ex1", amount_usd: 5 }], trip: { hotel: { name: "X", check_in: "" } },
    profile: { nickname: "", topics: ["AI"], services: [] }
  });
  const keys = Object.keys(Sync.units(s, CFG));
  ["favorites|A", "daily_plan|2026-12-01|A", "expenses|ex1", "trip|hotel.name", "trip|hotel.check_in", "profile|topics", "profile|nickname", "fx_rate"]
    .forEach((k) => ok(keys.includes(k), `missing ${k} in ${J(keys)}`));
});
test("units: local keys and sync excluded", () => {
  const keys = Object.keys(Sync.units(base(), CFG));
  ["theme", "text_scale", "sync_local", "sync"].forEach((p) =>
    ok(!keys.some((k) => k === p || k.startsWith(p + "|")), `${p} leaked: ${J(keys)}`));
});
test("units: checklist null equals defaults", () => {
  eq(Sync.units(Object.assign(base(), { checklist: null }), CFG), Sync.units(Object.assign(base(), { checklist: CFG.checklistDefaults() }), CFG), "units");
});

/* ---------- 기록 ---------- */
test("track: only changed unit stamped", () => {
  const d = device().edit((s) => s.favorites.push("A"), 100).edit((s) => { s.fx_rate = 1400; }, 200);
  eq(d.s.sync.stamps["favorites|A"], 100, "favorites|A");
  eq(d.s.sync.stamps.fx_rate, 200, "fx_rate");
  eq(Object.keys(d.s.sync.stamps).sort(), ["favorites|A", "fx_rate"], "only two stamps");
});
test("track: delete leaves tomb, re-add clears it", () => {
  const d = device().edit((s) => s.favorites.push("A"), 100).edit((s) => { s.favorites = []; }, 300);
  eq(d.s.sync.tombs["favorites|A"], 300, "tomb");
  ok(!("favorites|A" in d.s.sync.stamps), "stamp removed on delete");
  d.edit((s) => s.favorites.push("A"), 400);
  eq(d.s.sync.stamps["favorites|A"], 400, "stamp again");
  ok(!("favorites|A" in d.s.sync.tombs), "tomb cleared");
});
test("track: materialising default checklist stamps nothing", () => {
  const d = device().edit((s) => { s.checklist = CFG.checklistDefaults(); }, 500);
  ok(!Object.keys(d.s.sync.stamps).some((k) => k.startsWith("checklist|")), J(d.s.sync.stamps));
});

/* ---------- 되살리기 ---------- */
test("rebuild: keeps local order, appends remote-only", () => {
  const local = Object.assign(base(), {
    expenses: [{ id: "b" }, { id: "a" }],
    daily_plan: { "2026-12-01": [{ session_id: "x", note: "" }, { session_id: "y", note: "" }] }
  });
  const remote = Object.assign(base(), {
    expenses: [{ id: "c" }, { id: "a" }],
    daily_plan: { "2026-12-01": [{ session_id: "z", note: "" }, { session_id: "x", note: "" }] }
  });
  const chosen = {};
  [local, remote].forEach((s) => Object.entries(Sync.units(s, CFG)).forEach(([k, v]) => { chosen[k] = JSON.parse(v); }));
  const out = Sync.rebuild(local, remote, chosen);
  eq(out.expenses.map((e) => e.id), ["b", "a", "c"], "expenses order");
  eq(out.daily_plan["2026-12-01"].map((p) => p.session_id), ["x", "y", "z"], "daily_plan order");
  ok(!("theme" in out) && !("sync" in out), "no local keys or sync in rebuild output");
});

/* ---------- 합치기 ---------- */
const snap = (s) => JSON.parse(J(Sync.synced(s))); // 보낸 파일처럼 그 순간의 사본
const canon = (s) => { // 순서와 상관없이 비교: 단위 + 기록을 키 순으로
  const sort = (o) => Object.keys(o || {}).sort().map((k) => [k, o[k]]);
  return J({ u: sort(Sync.units(s, CFG)), st: sort(s.sync.stamps), tb: sort(s.sync.tombs) });
};
const ex = (id, usd) => ({ id, amount_usd: usd });
test("merge: disjoint additions are both kept", () => {
  const A = device().edit((s) => s.favorites.push("A"), 100);
  const B = device().edit((s) => s.expenses.push(ex("ex1", 5)), 200);
  const { state, summary } = Sync.merge(A.s, snap(B.s), { cfg: CFG });
  eq(state.favorites, ["A"], "favorites kept");
  eq(state.expenses.map((e) => e.id), ["ex1"], "expense added");
  eq(summary.rows.expenses.add, 1, "rows.expenses.add");
  eq(summary.total, 1, "total");
});
test("merge: later edit wins and counts overwritten", () => {
  const A = device().edit((s) => s.expenses.push(ex("ex1", 10)), 100).edit((s) => { s.expenses[0].amount_usd = 25; }, 300);
  const B = device().edit((s) => s.expenses.push(ex("ex1", 10)), 100).edit((s) => { s.expenses[0].amount_usd = 30; }, 400);
  let r = Sync.merge(A.s, snap(B.s), { cfg: CFG, lastReceivedAt: 200 });
  eq(r.state.expenses[0].amount_usd, 30, "later edit wins");
  eq(r.summary.rows.expenses.change, 1, "change");
  eq(r.summary.overwritten, 1, "overwritten since last receive");
  r = Sync.merge(A.s, snap(B.s), { cfg: CFG, lastReceivedAt: 350 });
  eq(r.summary.overwritten, 0, "local edit was before last receive");
});
test("merge: delete after edit deletes, edit after delete keeps", () => {
  const A = device().edit((s) => s.expenses.push(ex("ex1", 10)), 100).edit((s) => { s.expenses = []; }, 500);
  let B = device().edit((s) => s.expenses.push(ex("ex1", 10)), 100).edit((s) => { s.expenses[0].amount_usd = 20; }, 400);
  let r = Sync.merge(B.s, snap(A.s), { cfg: CFG });
  eq(r.state.expenses.length, 0, "deleted");
  eq(r.summary.rows.expenses.del, 1, "rows.del");
  B = device().edit((s) => s.expenses.push(ex("ex1", 10)), 100).edit((s) => { s.expenses[0].amount_usd = 20; }, 600);
  r = Sync.merge(B.s, snap(A.s), { cfg: CFG });
  eq(r.state.expenses.map((e) => e.amount_usd), [20], "kept");
});
test("merge: trip merges per field", () => {
  const A = device().edit((s) => { s.trip.hotel.name = "Wynn"; }, 100);
  const B = device().edit((s) => { s.trip.hotel.check_in = "2026-11-29"; }, 200);
  const { state } = Sync.merge(A.s, snap(B.s), { cfg: CFG });
  eq(state.trip.hotel, { name: "Wynn", check_in: "2026-11-29" }, "both fields");
});
test("merge: local-only keys keep local values", () => {
  const A = device({ theme: "dark", text_scale: 1.25 });
  const B = device({ theme: "light", text_scale: 1 });
  const { state } = Sync.merge(A.s, Object.assign(snap(B.s), { theme: "light" }), { cfg: CFG });
  eq([state.theme, state.text_scale, state.sync_local], ["dark", 1.25, A.s.sync_local], "local keys");
});
test("merge: commutative for recorded units", () => {
  const mk = (rate, fav, t) => device().edit((s) => { s.fx_rate = rate; s.favorites.push(fav); s.expenses.push(ex("ex-" + fav, t)); }, t)
    .edit((s) => { s.profile.nickname = "n" + fav; }, t + 1);
  const A = mk(1400, "A", 100), B = mk(1500, "B", 100); // fx_rate: 같은 시각, 값 다름
  const ab = Sync.merge(A.s, snap(B.s), { cfg: CFG }).state, ba = Sync.merge(B.s, snap(A.s), { cfg: CFG }).state;
  eq(canon(ab), canon(ba), "A+B vs B+A");
  eq(ab.fx_rate, 1500, "tie → larger JSON");
});
test("merge: idempotent", () => {
  const A = device().edit((s) => s.favorites.push("A"), 100), B = device().edit((s) => s.expenses.push(ex("ex1", 5)), 200);
  const M = Sync.merge(A.s, snap(B.s), { cfg: CFG }).state;
  const again = Sync.merge(M, snap(M), { cfg: CFG });
  eq(again.summary.total, 0, "no changes");
  eq(again.state.sync, M.sync, "same records");
});
test("merge: older file never removes newer data", () => {
  const A = device();
  const B = device().edit((s) => s.favorites.push("A"), 100);
  const R0 = snap(B.s);
  B.edit((s) => s.expenses.push(ex("ex2", 5)), 300);
  const R1 = snap(B.s);
  A.take(Sync.merge(A.s, R1, { cfg: CFG }).state);
  const r = Sync.merge(A.s, R0, { cfg: CFG, lastReceivedAt: 400, lastReceivedExportedAt: 300, remoteExportedAt: 100 });
  eq(r.state.expenses.map((e) => e.id), ["ex2"], "ex2 survives old file");
  eq(r.summary.stale, true, "stale");
});
test("merge: legacy only on this device's first merge", () => {
  const A = device({ fx_rate: 1400 }), B = device({ fx_rate: 1500 }); // 둘 다 기록 없음 (업데이트 전 데이터)
  const first = Sync.merge(A.s, snap(B.s), { cfg: CFG });
  eq(first.state.fx_rate, 1500, "unrecorded tie → remote");
  eq(first.summary.legacy, true, "legacy on first merge");
  const second = Sync.merge(first.state, snap(B.s), { cfg: CFG, lastReceivedAt: 1000 });
  eq(second.summary.legacy, false, "no legacy notice after first merge");
});
test("merge: merged state re-saved stamps nothing", () => {
  const A = device().edit((s) => s.favorites.push("A"), 100), B = device().edit((s) => s.expenses.push(ex("ex1", 5)), 200);
  const M = Sync.merge(A.s, snap(B.s), { cfg: CFG }).state;
  const before = J(M.sync);
  device().take(M).edit(() => {}, 999);
  eq(J(M.sync), before, "stamps untouched by save after merge");
});
test("merge: default checklist on late device does not undo a check", () => {
  const A = device().edit((s) => { s.checklist = CFG.checklistDefaults(); s.checklist[0].done = true; }, 100);
  const B = device().edit((s) => { s.checklist = CFG.checklistDefaults(); }, 500);
  const { state } = Sync.merge(B.s, snap(A.s), { cfg: CFG });
  eq(state.checklist[0].done, true, "pk0 stays checked");
});
test("replaceSynced: keeps local keys, takes remote data and sync", () => {
  const A = device({ theme: "dark", favorites: ["A"] });
  const B = device().edit((s) => s.favorites.push("B"), 100);
  const out = Sync.replaceSynced(A.s, snap(B.s));
  eq([out.theme, out.favorites, out.sync.stamps["favorites|B"]], ["dark", ["B"], 100], "replace");
});
test("lost: counts local-only units", () => {
  const A = device({ favorites: ["A", "B"] }), B = device({ favorites: ["A"] });
  eq(Sync.lost(A.s, snap(B.s), CFG), { favorites: 1 }, "lost");
});

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) {
    try { await fn(); console.log("  ✓", n); } catch (e) { fails++; console.log("  ✗", n, "—", e.message); }
  }
  console.log(fails ? `❌ 합치기 테스트 실패 ${fails}건` : `✅ 합치기 테스트 통과 — ${tests.length}개`);
  process.exit(fails ? 1 : 0);
})();
