# 사내 그룹웨어 웹 프로토타입

Supabase(Auth / REST) 연동 기반의 정적 웹 그룹웨어입니다. 빌드 과정 없이 `index.html`만으로 동작합니다.

## 1. 폴더 및 파일 구성
- `index.html`: 로그인/회원가입 화면, 좌측 사이드바, 상단 헤더, 중앙 콘텐츠 레이아웃
- `css/style.css`: 스타일 시스템
- `js/data.js`: 빈 초기 데이터 구조(`INITIAL_SEED_DATA`). 실제 데이터는 Supabase에서 동기화
- `js/storage.js`: `localStorage` 캐시 및 Supabase 동기화 모듈
- `js/auth.js`: Supabase 로그인/회원가입, 관리자 승인 상태 검증 (세션은 `sessionStorage` 사용 → 탭/브라우저 종료 시 자동 로그아웃)
- `js/modules/dashboard.js`: 대시보드 카드/위젯 렌더링
- `js/main.js`: 메뉴 라우팅, 전자결재/게시판/공지/관리자 기능 및 공통 이벤트 제어

## 2. 실행 방법
1. VS Code에서 프로젝트 폴더를 엽니다.
2. `index.html`을 우클릭하여 **Open with Live Server**를 실행합니다.

## 3. 참고
- 스크립트 로드 순서: `data.js` → `storage.js` → `auth.js` → `dashboard.js` → `main.js`
- 마스터 관리자 이메일은 `js/auth.js`의 `MASTER_ADMIN_EMAIL`에서 설정합니다.
