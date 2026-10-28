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

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) {
    try { await fn(); console.log("  ✓", n); } catch (e) { fails++; console.log("  ✗", n, "—", e.message); }
  }
  console.log(fails ? `❌ 합치기 테스트 실패 ${fails}건` : `✅ 합치기 테스트 통과 — ${tests.length}개`);
  process.exit(fails ? 1 : 0);
})();
