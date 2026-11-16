# 사내 그룹웨어 웹 프로토타입 (1단계 구현본)

## 1. 폴더 및 파일 구성 (`D:\groupware-prototype\`)
- `index.html`: 로그인 화면, 고정형 좌측 사이드바, 상단 헤더, 중앙 동적 콘텐츠 레이아웃
- `css/style.css`: 기업용 SaaS 스타일 디자인 시스템
- `js/data.js`: 가상 테스트 사용자 5명 및 초기 시드 데이터
- `js/storage.js`: `localStorage` 기반 데이터 유지 및 초기화 모듈
- `js/auth.js`: 테스트 계정 로그인/전환 및 권한 검증 시뮬레이션
- `js/modules/dashboard.js`: 1단계 대시보드 카드/위젯 렌더링 및 메뉴 이동 연동
- `js/main.js`: 사이드바 메뉴 클릭 시 페이지 전환 라우터 및 공통 이벤트 제어

## 2. D:\ 드라이브 배치 및 VS Code Live Server 실행 방법
1. 다운로드한 `groupware-prototype-phase1.zip` 압축 파일을 **`D:\` 드라이브 바로 아래**에 압축 해제하여 **`D:\groupware-prototype`** 폴더가 생성되도록 합니다. (기존 `Tango OCR` 폴더와 완전히 분리됨)
2. VS Code를 실행한 뒤 **[파일(File)] -> [폴더 열기(Open Folder)]**에서 `D:\groupware-prototype` 폴더를 선택합니다.
3. `index.html` 파일을 마우스 우클릭하고 **[Open with Live Server]**를 클릭하면 브라우저에서 즉시 실행됩니다.
