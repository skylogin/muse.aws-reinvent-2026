# re:Invent 2026 출장 앱

서버 없는 PWA입니다. 데이터는 사용자 기기(localStorage)에만 저장합니다.

## 배포

- `main`에 push하면 GitHub Actions(`.github/workflows/pages.yml`)가 `node scripts/check-data.js`(데이터·파일 목록)와 `node scripts/test-sync.js`(기기 간 합치기 로직)를 실행합니다.
- 점검을 통과한 커밋만 GitHub Pages에 배포합니다. 점검이 실패하면 이전 배포가 그대로 남습니다.
- 처음 한 번: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
- 화면 주소: `#/home`, `#/sessions`, `#/planner`, `#/guide`, `#/expenses`, `#/settings`, `#/expenses/add` (홈 화면 아이콘 바로가기에서 사용)

## 데이터 갱신 규칙

1. 바뀐 파일(`js/data.js`, `js/data-chunk-*.js`, `js/abstract*-chunk-*.js`, `index.html`, `sw.js`)을 **커밋 1개**로 올립니다. 파일을 하나씩 커밋하면 그 사이에 앱이 없는 파일을 부르는 상태가 됩니다.
2. 올리기 전에 `node scripts/check-data.js`를 실행합니다. 실패 목록이 나오면 고친 뒤 올립니다.
3. `sw.js`의 `CACHE` 버전을 올립니다. 그래야 설치된 앱이 새 데이터를 받습니다.
4. 세션 소개 청크(`js/abstract*-chunk-*.js`)의 `<script>`에는 `async`를 붙입니다. 첫 화면을 막지 않게 하기 위해서입니다.

## 다른 기기와 이어하기 (폰 ↔ PC)

설정 맨 위 **🔄 다른 기기와 이어하기**에서 주고받습니다. 서버 없이 파일로 옮깁니다.

- **보내기:** [📤 보내기] → [공유하기로 보내기]를 누르고 공유 창에서 고릅니다.
  - iPhone → Mac: AirDrop
  - 삼성폰 → Windows PC: 카카오톡 나와의 채팅
  - 영수증 사진도 파일에 함께 들어갑니다. 텍스트 코드는 사진이 빠진 예비 수단입니다.
- **받기:** [📥 받기]에서 받습니다.
  - PC: 파일을 화면에 끌어다 놓습니다.
  - 폰: [파일 선택]으로 고릅니다.
  - 바로 반영하지 않고, 무엇이 바뀌는지 먼저 보여 줍니다.
- **합치기:** 덮어쓰지 않고 항목별로 합칩니다.
  - 두 기기에서 각자 넣은 것은 모두 남습니다.
  - 같은 항목을 양쪽에서 고쳤으면 나중에 고친 쪽이 남습니다.
  - 지운 것도 전달됩니다.
  - 테마·글자 크기·알림은 기기마다 따로 둡니다.
- **되돌리기:** 가져온 직후의 [되돌리기], 또는 설정의 "마지막 가져오기 되돌리기"로 한 번 되돌릴 수 있습니다.
- **처음 합칠 때:** 업데이트 전에 넣은 데이터는 변경 기록이 없어 양쪽을 모두 합친 결과가 됩니다. 그 전에 지운 항목이 다시 생길 수 있습니다.
- **설계 문서:** `docs/superpowers/specs/2026-10-28-device-sync-design.md`, 합치기 로직 `js/sync.js`
