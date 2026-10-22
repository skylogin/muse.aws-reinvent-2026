#!/usr/bin/env node
/* 데이터·배포 점검: 앱이 깨진 상태로 배포되지 않게 막는다.
   - index.html·sw.js가 부르는 파일이 모두 있는지, 청크 목록이 서로 맞는지
   - 세션 소개(abstract) 청크가 async로 불리는지 (첫 화면을 막지 않게)
   - 세션 데이터의 수·형식, 베뉴 좌표, Expo 시간 형식 (앱이 읽는 형태 그대로인지)
   사용: node scripts/check-data.js   (문제가 있으면 목록을 보여 주고 exit 1) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const errors = [];
const fail = (msg) => errors.push(msg);
const all = (re, s) => { const out = []; let m; while ((m = re.exec(s))) out.push(m); return out; };

/* ---- 1. 파일 참조 ---- */
const html = read("index.html");
const scripts = all(/<script\s+src="([^"]+)"([^>]*)><\/script>/g, html).map((m) => ({ src: m[1], attrs: m[2] }));
scripts.forEach((s) => { if (!exists(s.src)) fail(`index.html이 없는 파일을 불러요: ${s.src}`); });
scripts.filter((s) => /^js\/abstract(-ko)?-chunk-\d+\.js$/.test(s.src) && !/\basync\b/.test(s.attrs))
  .forEach((s) => fail(`세션 소개 청크는 async로 불러야 해요 (첫 화면 지연): ${s.src}`));

const sw = read("sw.js");
const assetsBlock = (sw.match(/const ASSETS = \[([\s\S]*?)\];/) || [])[1];
if (!assetsBlock) fail("sw.js에서 ASSETS 목록을 찾지 못했어요");
const assets = assetsBlock ? all(/"\.\/([^"]*)"/g, assetsBlock).map((m) => m[1] || "index.html") : [];
assets.forEach((a) => { if (!exists(a)) fail(`sw.js 캐시 목록에 없는 파일이 있어요: ${a}`); });

const chunkRe = /^js\/(data|abstract|abstract-ko)-chunk-\d+\.js$/;
const onDisk = fs.readdirSync(path.join(root, "js")).map((f) => "js/" + f).filter((f) => chunkRe.test(f)).sort();
const inHtml = scripts.map((s) => s.src).filter((f) => chunkRe.test(f)).sort();
const inSw = assets.filter((f) => chunkRe.test(f)).sort();
const diff = (a, b) => a.filter((x) => b.indexOf(x) < 0);
diff(onDisk, inHtml).forEach((f) => fail(`index.html이 부르지 않는 청크 파일: ${f}`));
diff(inHtml, inSw).forEach((f) => fail(`sw.js 캐시 목록에 빠진 청크: ${f}`));
diff(inSw, inHtml).forEach((f) => fail(`sw.js에만 있고 index.html에는 없는 청크: ${f}`));

/* ---- 2. 데이터 불러오기 (브라우저와 같은 순서) ---- */
const ctx = { window: {} };
vm.createContext(ctx);
const run = (f) => {
  if (!exists(f)) return; // 위에서 '없는 파일'로 이미 보고함
  try { vm.runInContext(read(f), ctx, { filename: f }); } catch (e) { fail(`${f} 실행 오류: ${e.message}`); }
};
scripts.filter((s) => /^js\/data(-chunk-\d+)?\.js$/.test(s.src)).forEach((s) => run(s.src));
scripts.filter((s) => /^js\/abstract(-ko)?-chunk-\d+\.js$/.test(s.src)).forEach((s) => run(s.src));
const D = ctx.window.APP_DATA || {};
const S = Array.isArray(D.sessions) ? D.sessions : [];
const ei = D.event_info || {};
const meta = D.meta || {};

/* ---- 3. 세션 ---- */
if (!S.length) fail("세션이 0개예요");
if (meta.session_count != null && meta.session_count !== S.length)
  fail(`세션 수가 맞지 않아요: meta.session_count=${meta.session_count}, 실제=${S.length} (청크 일부만 갱신된 상태일 수 있음)`);
const ids = {};
S.forEach((s) => { if (ids[s.session_id]) fail(`세션 ID 중복: ${s.session_id}`); ids[s.session_id] = 1; });

// 앱의 베뉴 좌표 조회와 같은 규칙 (planner.js의 VENUE_ALIASES·EXTRA_VENUES를 그대로 읽음)
const planner = read("js/planner.js");
const lit = (name, open, close) => {
  const m = planner.match(new RegExp(`const ${name} = (\\${open}[^\\n]*\\${close});`));
  if (!m) { fail(`planner.js에서 ${name}를 찾지 못했어요`); return null; }
  return vm.runInNewContext(`(${m[1]})`);
};
const aliases = lit("VENUE_ALIASES", "{", "}") || {};
const extra = lit("EXTRA_VENUES", "[", "]") || [];
const venues = (ei.venues || []).concat(extra);
const venueNames = {};
venues.forEach((v) => {
  venueNames[v.name] = 1;
  const ok = typeof v.lat === "number" && typeof v.lng === "number" && v.lat > 35.9 && v.lat < 36.4 && v.lng > -115.4 && v.lng < -114.9;
  if (!ok) fail(`베뉴 좌표가 라스베가스 범위를 벗어나요: ${v.name} (${v.lat}, ${v.lng})`);
});

const ev = ei.event || {};
const dateRe = /^\d{4}-\d{2}-\d{2}$/, timeRe = /^\d{2}:\d{2}$/;
const bad = {};
const note = (key, id) => { (bad[key] = bad[key] || []).push(id); };
S.forEach((s) => {
  const id = s.session_id || "(ID 없음)";
  if (!s.title) note("제목 없음", id);
  if (!dateRe.test(s.date || "")) note("날짜 형식(YYYY-MM-DD) 아님", id);
  else if ((ev.start_date && s.date < ev.start_date) || (ev.end_date && s.date > ev.end_date)) note("행사 기간 밖 날짜", id);
  if (!timeRe.test(s.start_time || "") || !timeRe.test(s.end_time || "")) note("시간 형식(HH:MM) 아님", id);
  else if (s.end_time <= s.start_time) note("끝나는 시간이 시작보다 빠름", id);
  if (!s.venue) note("베뉴 없음", id);
  else if (!venueNames[aliases[s.venue] || s.venue]) note(`좌표 없는 베뉴 '${s.venue}'`, id);
});
Object.keys(bad).forEach((k) => fail(`${k}: ${bad[k].length}개 (예: ${bad[k].slice(0, 3).join(", ")})`));

/* ---- 4. 앱이 직접 읽는 event_info 형식 ---- */
const expo = ei.expo || {};
["monday", "tuesday", "wednesday", "thursday"].forEach((k) => {
  if (expo[k] != null && !/^\d{1,2}\/\d{1,2} \S/.test(expo[k])) fail(`expo.${k} 형식이 "M/D 시간"이 아니에요: ${expo[k]}`);
});

/* ---- 결과 ---- */
if (errors.length) {
  console.error(`❌ 점검 실패 ${errors.length}건`);
  errors.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
const withAbs = S.filter((s) => s.abstract || s.abstract_ko).length;
console.log(`✅ 점검 통과 — 세션 ${S.length}개 (소개 있음 ${withAbs}개), 청크 ${inHtml.length}개, 캐시 파일 ${assets.length}개, 베뉴 ${venues.length}곳`);
