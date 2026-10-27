# re:Invent 2026 출장 앱

서버 없는 PWA입니다. 데이터는 사용자 기기(localStorage)에만 저장합니다.

## 배포

- `main`에 push하면 GitHub Actions(`.github/workflows/pages.yml`)가 `node scripts/check-data.js`를 실행합니다.
- 점검을 통과한 커밋만 GitHub Pages에 배포합니다. 점검이 실패하면 이전 배포가 그대로 남습니다.
- 처음 한 번: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
- 화면 주소: `#/home`, `#/sessions`, `#/planner`, `#/guide`, `#/expenses`, `#/settings`, `#/expenses/add` (홈 화면 아이콘 바로가기에서 사용)

## 데이터 갱신 규칙

1. 바뀐 파일(`js/data.js`, `js/data-chunk-*.js`, `js/abstract*-chunk-*.js`, `index.html`, `sw.js`)을 **커밋 1개**로 올립니다. 파일을 하나씩 커밋하면 그 사이에 앱이 없는 파일을 부르는 상태가 됩니다.
2. 올리기 전에 `node scripts/check-data.js`를 실행합니다. 실패 목록이 나오면 고친 뒤 올립니다.
3. `sw.js`의 `CACHE` 버전을 올립니다. 그래야 설치된 앱이 새 데이터를 받습니다.
4. 세션 소개 청크(`js/abstract*-chunk-*.js`)의 `<script>`에는 `async`를 붙입니다. 첫 화면을 막지 않게 하기 위해서입니다.
