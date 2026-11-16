/**
 * js/data.js
 * 초기 시드 데이터 (가상 테스트 계정, 부서, 휴가 기안, 공지사항, 게시글, 일정 등)
 * 실제 회사 개인정보나 내부 서버 정보를 일절 포함하지 않습니다.
 */

const INITIAL_SEED_DATA = {
  // 1. 테스트 사용자 (요청서 4번 항목 기준)
  users: [
    { id: "kim", password: "1234", name: "김민수", dept: "개발팀", position: "사원", duty: "팀원", role: "USER", phone: "010-1000-0001", email: "kim@company.local", annualTotal: 15, annualUsed: 3 },
    { id: "park", password: "1234", name: "박지훈", dept: "개발팀", position: "대리", duty: "선임", role: "USER", phone: "010-1000-0002", email: "park@company.local", annualTotal: 15, annualUsed: 2 },
    { id: "lee", password: "1234", name: "이서연", dept: "개발팀", position: "팀장", duty: "부서장", role: "MANAGER", phone: "010-1000-0003", email: "lee@company.local", annualTotal: 18, annualUsed: 4 },
    { id: "choi", password: "1234", name: "최유진", dept: "경영지원팀", position: "과장", duty: "인사/총무관리자", role: "ADMIN", phone: "010-1000-0004", email: "choi@company.local", annualTotal: 16, annualUsed: 1 },
    { id: "ceo", password: "1234", name: "대표님", dept: "임원실", position: "대표이사", duty: "CEO (최종결재권자)", role: "CEO", phone: "010-1000-0000", email: "ceo@company.local", annualTotal: 25, annualUsed: 0 }
  ],

  // 2. 부서 정보
  departments: [
    { id: "dept-ceo", name: "임원실", parentId: null, manager: "대표님" },
    { id: "dept-mgmt", name: "경영지원팀", parentId: "dept-ceo", manager: "최유진" },
    { id: "dept-dev", name: "개발팀", parentId: "dept-ceo", manager: "이서연" },
    { id: "dept-biz", name: "사업팀", parentId: "dept-ceo", manager: "정현우" }
  ],

  // 3. 전자결재 휴가 신청서 (대시보드 및 결재 연동용 샘플)
  leaveRequests: [
    {
      id: "DOC-2026-101",
      applicantId: "kim",
      applicantName: "김민수",
      dept: "개발팀",
      position: "사원",
      leaveType: "연차",
      startDate: "2026-11-03",
      endDate: "2026-11-05",
      days: 3,
      reason: "개인 가정사 및 휴식",
      note: "업무 인수인계: 박지훈 대리",
      status: "APPROVED", // 최종 승인 완료
      createdAt: "2026-10-28",
      currentStepIndex: 3,
      approvalLine: [
        { step: 1, userId: "park", name: "박지훈", position: "대리", status: "APPROVED", actedAt: "2026-10-28 10:20", comment: "업무 대행 확인했습니다." },
        { step: 2, userId: "lee", name: "이서연", position: "팀장", status: "APPROVED", actedAt: "2026-10-28 14:10", comment: "일정 확인 완료, 승인합니다." },
        { step: 3, userId: "ceo", name: "대표님", position: "대표이사", status: "APPROVED", actedAt: "2026-10-29 09:05", comment: "최종 승인합니다." }
      ]
    },
    {
      id: "DOC-2026-102",
      applicantId: "park",
      applicantName: "박지훈",
      dept: "개발팀",
      position: "대리",
      leaveType: "연차",
      startDate: "2026-11-12",
      endDate: "2026-11-13",
      days: 2,
      reason: "가족 행사 참석",
      note: "비상 연락망 유지",
      status: "IN_PROGRESS", // 1차 이서연 승인 완료 -> 대표님 결재 대기
      createdAt: "2026-11-04",
      currentStepIndex: 1,
      approvalLine: [
        { step: 1, userId: "lee", name: "이서연", position: "팀장", status: "APPROVED", actedAt: "2026-11-04 15:00", comment: "승인합니다." },
        { step: 2, userId: "ceo", name: "대표님", position: "대표이사", status: "WAITING", actedAt: null, comment: "" }
      ]
    },
    {
      id: "DOC-2026-103",
      applicantId: "kim",
      applicantName: "김민수",
      dept: "개발팀",
      position: "사원",
      leaveType: "오후반차",
      startDate: "2026-11-18",
      endDate: "2026-11-18",
      days: 0.5,
      reason: "병원 진료",
      note: "14시 이후 외출",
      status: "PENDING", // 1차 결재자 박지훈 결재 대기
      createdAt: "2026-11-05",
      currentStepIndex: 0,
      approvalLine: [
        { step: 1, userId: "park", name: "박지훈", position: "대리", status: "WAITING", actedAt: null, comment: "" },
        { step: 2, userId: "lee", name: "이서연", position: "팀장", status: "WAITING", actedAt: null, comment: "" },
        { step: 3, userId: "ceo", name: "대표님", position: "대표이사", status: "WAITING", actedAt: null, comment: "" }
      ]
    }
  ],

  // 4. 회사 공지사항
  notices: [
    { id: "N-01", title: "[필독] 사내 그룹웨어 웹 프로토타입 오픈 및 휴가 전자결재 안내", author: "최유진 과장", date: "2026-11-01", pinned: true, views: 28, content: "전 직원은 금일부터 메신저 대신 그룹웨어 전자결재를 통해 휴가를 신청해 주시기 바랍니다." },
    { id: "N-02", title: "2026년 하반기 정보보안 및 개인정보보호 정기 교육 안내", author: "최유진 과장", date: "2026-11-03", pinned: true, views: 19, content: "사내 보안 규정에 따라 전 직원 필수 이수 바랍니다." },
    { id: "N-03", title: "11월 사내 단합 행사 및 금요일 일정 안내", author: "경영지원팀", date: "2026-11-04", pinned: false, views: 24, content: "금주 금요일 사내 행사 일정을 확인해 주세요." }
  ],

  // 5. 사내 게시판 최근 글
  boardPosts: [
    { id: "B-01", category: "업무 공유 게시판", title: "데이터베이스 검수 스크립트 실행 가이드 공유", author: "이서연 팀장", dept: "개발팀", date: "2026-11-04", comments: 3 },
    { id: "B-02", category: "자유 게시판", title: "탕비실 신규 원두 추천 받습니다 ☕", author: "박지훈 대리", dept: "개발팀", date: "2026-11-04", comments: 5 },
    { id: "B-03", category: "부서별 게시판", title: "[개발팀] 듀얼 모니터 눈 피로도 절감 설정 팁", author: "김민수 사원", dept: "개발팀", date: "2026-11-05", comments: 2 }
  ],

  // 6. 주요 회사 일정
  companyEvents: [
    { id: "E-01", title: "전사 주간 공정 점검 회의", date: "2026-11-09", type: "정기 회의" },
    { id: "E-02", title: "사내 단합 야유회 행사", date: "2026-11-13", type: "사내 행사" },
    { id: "E-03", title: "2026 데이터베이스 구축 중간 검수 마감", date: "2026-11-20", type: "프로젝트 일정" }
  ],

  // 7. 업무용 프로그램 설치 안내
  programs: [
    { id: "P-01", name: "사내 보안 VPN 클라이언트", version: "v2.4.1", dept: "개발팀 (박지훈 대리)", desc: "외부 원격 접속 시 필수 설치 보안 프로그램" },
    { id: "P-02", name: "문서 뷰어 및 PDF 변환 도구", version: "v5.0", dept: "경영지원팀 (최유진 과장)", desc: "전자결재 첨부 문서 열람 및 표준 양식 인쇄용" }
  ],

  // 8. 자료실 샘플
  files: [
    { id: "F-01", category: "회사 양식", title: "표준 품의서 및 지출결의서 양식.docx", author: "최유진 과장", date: "2026-10-15", size: "48 KB" },
    { id: "F-02", category: "업무 매뉴얼", title: "신규 입사자 그룹웨어 전자결재 매뉴얼.pdf", author: "경영지원팀", date: "2026-11-01", size: "1.2 MB" }
  ]
};
