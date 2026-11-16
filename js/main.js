/**
 * js/main.js
 * 메인 애플리케이션 컨트롤러 (로그인 제어, 사이드바 라우팅, 페이지 전환, 권한 체크)
 */

const PAGE_TITLES = {
  "dashboard": "대시보드",
  "approval": "전자결재 및 휴가 신청",
  "leave-calendar": "전사 휴가 캘린더",
  "attendance": "근태 관리 (추후 확장 예정)",
  "organization": "회사 조직도",
  "notice": "회사 공지사항",
  "board": "사내 게시판",
  "schedule": "회사 일정",
  "programs": "프로그램 설치 안내",
  "archive": "전사 자료실",
  "admin": "시스템 관리자 설정"
};

const App = {
  currentPage: "dashboard",

  init() {
    StorageDB.init();
    this.renderQuickAccountButtons();
    this.bindGlobalEvents();

    const sessionUser = Auth.getCurrentUser();
    if (sessionUser) {
      this.enterApp(sessionUser);
    } else {
      this.showLoginScreen();
    }
  },

  // 로그인 화면의 원클릭 테스트 계정 버튼 생성
  renderQuickAccountButtons() {
    const db = StorageDB.getData();
    const grid = document.getElementById("quick-account-list");
    if (!grid) return;

    grid.innerHTML = db.users.map(u => `
      <button type="button" class="quick-acc-btn" data-userid="${u.id}">
        <strong>${u.name} ${u.position}</strong>
        <span>${u.dept} · ${Auth.getRoleLabel(u.role)}</span>
      </button>
    `).join("");

    grid.querySelectorAll(".quick-acc-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const userId = btn.getAttribute("data-userid");
        document.getElementById("login-id").value = userId;
        document.getElementById("login-pw").value = "1234";
        const res = Auth.login(userId, "1234");
        if (res.success) {
          this.showToast(`${res.user.name} (${res.user.position}) 계정으로 로그인되었습니다.`);
          this.enterApp(res.user);
        }
      });
    });
  },

  bindGlobalEvents() {
    // 1. 로그인 폼 제출
    const loginForm = document.getElementById("login-form");
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("login-id").value.trim();
      const pw = document.getElementById("login-pw").value.trim();
      const res = Auth.login(id, pw);
      const errEl = document.getElementById("login-error");

      if (!res.success) {
        errEl.classList.remove("hidden");
        return;
      }
      errEl.classList.add("hidden");
      this.showToast(`환영합니다, ${res.user.name} ${res.user.position}님!`);
      this.enterApp(res.user);
    });

    // 2. 좌측 사이드바 메뉴 클릭 시 페이지 전환
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const page = btn.getAttribute("data-page");
        this.navigateTo(page);
      });
    });

    // 3. 상단 로고 클릭 시 대시보드로 이동
    document.getElementById("brand-home").addEventListener("click", () => {
      this.navigateTo("dashboard");
    });

    // 4. 상단 테스트 계정 즉시 전환 셀렉트박스
    const switcher = document.getElementById("header-user-switcher");
    switcher.addEventListener("change", (e) => {
      const switchedUser = Auth.quickSwitch(e.target.value);
      if (switchedUser) {
        this.showToast(`🔄 테스트 계정이 [${switchedUser.name} ${switchedUser.position}]으로 전환되었습니다.`);
        this.updateHeaderUserInfo(switchedUser);
        this.navigateTo(this.currentPage);
      }
    });

    // 5. 로그아웃 버튼
    document.getElementById("btn-logout").addEventListener("click", () => {
      Auth.logout();
      this.showToast("로그아웃 되었습니다.");
      this.showLoginScreen();
    });

    // 6. 테스트 데이터 초기화 버튼
    document.getElementById("btn-reset-storage").addEventListener("click", () => {
      if (confirm("브라우저 localStorage에 저장된 테스트 데이터를 초기 상태로 되돌리시겠습니까?")) {
        StorageDB.resetToSeed();
        this.showToast("테스트 데이터가 초기 시드 상태로 복원되었습니다.");
        this.navigateTo(this.currentPage);
      }
    });

    // 7. 상단 알림 아이콘 클릭
    document.getElementById("btn-notification").addEventListener("click", () => {
      this.navigateTo("approval");
      this.showToast("전자결재 문서함으로 이동했습니다.");
    });
  },

  showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-layout").classList.add("hidden");
  },

  enterApp(user) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-layout").classList.remove("hidden");
    this.populateHeaderSwitcher(user);
    this.updateHeaderUserInfo(user);
    this.navigateTo("dashboard");
  },

  populateHeaderSwitcher(currentUser) {
    const db = StorageDB.getData();
    const switcher = document.getElementById("header-user-switcher");
    switcher.innerHTML = db.users.map(u => `
      <option value="${u.id}" ${u.id === currentUser.id ? "selected" : ""}>
        ${u.name} (${u.position} / ${u.dept})
      </option>
    `).join("");
  },

  updateHeaderUserInfo(user) {
    document.getElementById("user-avatar").textContent = user.name.charAt(0);
    document.getElementById("user-name-display").textContent = `${user.name} ${user.position}`;
    document.getElementById("user-dept-display").textContent = `${user.dept} · ${Auth.getRoleLabel(user.role)}`;

    // 결재 대기 건수 배지 업데이트
    const db = StorageDB.getData();
    const waitingCount = db.leaveRequests.filter(r => {
      if (r.status === "APPROVED" || r.status === "REJECTED") return false;
      const step = r.approvalLine[r.currentStepIndex];
      return step && step.userId === user.id && step.status === "WAITING";
    }).length;
    document.getElementById("notif-count").textContent = waitingCount;
  },

  // 핵심 라우터: 사이드바 메뉴 클릭 시 페이지 전환
  navigateTo(pageKey) {
    const user = Auth.getCurrentUser();
    if (!user) {
      this.showLoginScreen();
      return;
    }

    this.currentPage = pageKey;

    // 사이드바 active 상태 갱신
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-page") === pageKey);
    });

    // 상단 페이지 제목 갱신
    document.getElementById("current-page-title").textContent = PAGE_TITLES[pageKey] || "사내 그룹웨어";
    this.updateHeaderUserInfo(user);

    const container = document.getElementById("page-content");

    // 1단계 핵심: 대시보드 렌더링
    if (pageKey === "dashboard") {
      DashboardModule.render(container, user);
      return;
    }

    // 관리자 전용 페이지 권한 체크 (일반 직원 차단 시뮬레이션)
    if (pageKey === "admin" && !Auth.isAdmin(user)) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:48px 20px;">
          <h3 style="color:var(--danger); font-size:20px; margin-bottom:10px;">⛔ 접근 권한이 없습니다</h3>
          <p style="color:var(--text-muted); margin-bottom:20px;">
            현재 로그인한 계정(<strong>${user.name} ${user.position}</strong> / ${Auth.getRoleLabel(user.role)})은 관리자 설정 메뉴에 접근할 수 없습니다.<br/>
            우측 상단의 <strong>[테스트 계정 전환]</strong>에서 <strong>최유진 (과장 / 관리자)</strong> 또는 <strong>대표님</strong> 계정으로 전환해 테스트해 보세요.
          </p>
          <button class="btn-primary" onclick="App.navigateTo('dashboard')">대시보드로 돌아가기</button>
        </div>
      `;
      return;
    }

    // 각 메뉴 클릭 시 실제 콘텐츠 화면 전환 (1단계 기본 조회 뷰 + 단계별 개발 안내)
    this.renderSubPageContent(container, pageKey, user);
  },

  renderSubPageContent(container, pageKey, user) {
    const db = StorageDB.getData();

    if (pageKey === "approval") {
      container.innerHTML = `
        <div class="section-banner">
          💡 <strong>[전자결재 메뉴]</strong> 현재 등록된 휴가 결재 문서 목록입니다. (2단계에서 기안서 작성 폼, 결재자 순서 지정 및 순차 승인/반려 처리가 본격 확장됩니다.)
        </div>
        <div class="card">
          <div class="card-header">
            <h4>📝 전체 전자결재 휴가 문서 현황</h4>
          </div>
          <table class="list-table">
            <thead>
              <tr><th>문서번호</th><th>신청자</th><th>종류</th><th>휴가 기간</th><th>일수</th><th>결재선 (최종: 대표님 고정)</th><th>현재 상태</th></tr>
            </thead>
            <tbody>
              ${db.leaveRequests.map(doc => `
                <tr>
                  <td><strong>${doc.id}</strong></td>
                  <td>${doc.applicantName} (${doc.dept})</td>
                  <td>${doc.leaveType}</td>
                  <td>${doc.startDate} ~ ${doc.endDate}</td>
                  <td>${doc.days}일</td>
                  <td>${doc.approvalLine.map(s => `${s.name}(${s.status === 'APPROVED' ? '승인' : '대기'})`).join(" → ")}</td>
                  <td><span class="status-badge status-${doc.status}">${DashboardModule.getStatusLabel(doc.status)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "leave-calendar") {
      const approved = db.leaveRequests.filter(r => r.status === "APPROVED");
      container.innerHTML = `
        <div class="section-banner">
          💡 <strong>[휴가 캘린더]</strong> 대표님 최종 승인이 완료된 휴가만 공개됩니다. (2단계에서 연속 가로선 <code>━━━━</code> 시각화 월간 캘린더 그리드가 구현됩니다.)
        </div>
        <div class="card">
          <div class="card-header"><h4>📅 최종 승인된 전사 휴가 목록 (사유 비공개)</h4></div>
          <table class="list-table">
            <thead><tr><th>이름</th><th>부서</th><th>휴가 기간</th><th>일수</th></tr></thead>
            <tbody>
              ${approved.map(a => `
                <tr>
                  <td><strong>${a.applicantName} ${a.position}</strong></td>
                  <td>${a.dept}</td>
                  <td>${a.startDate} ~ ${a.endDate}</td>
                  <td>${a.days}일</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "organization") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>🏢 사내 조직도 및 임직원 연락처 (테스트 데이터)</h4></div>
          <table class="list-table">
            <thead><tr><th>부서</th><th>이름</th><th>직급</th><th>직책</th><th>업무용 연락처</th><th>이메일</th></tr></thead>
            <tbody>
              ${db.users.map(u => `
                <tr>
                  <td><strong>${u.dept}</strong></td>
                  <td>${u.name}</td>
                  <td>${u.position}</td>
                  <td>${u.duty}</td>
                  <td>${u.phone}</td>
                  <td>${u.email}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "notice") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>📢 회사 공지사항</h4></div>
          <table class="list-table">
            <thead><tr><th>구분</th><th>제목</th><th>작성자</th><th>작성일</th><th>조회수</th></tr></thead>
            <tbody>
              ${db.notices.map(n => `
                <tr>
                  <td>${n.pinned ? '<span class="status-badge status-REJECTED">중요공지</span>' : '일반'}</td>
                  <td><strong>${n.title}</strong><br/><span style="color:var(--text-muted); font-size:12px;">${n.content}</span></td>
                  <td>${n.author}</td>
                  <td>${n.date}</td>
                  <td>${n.views}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "board") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>💬 사내 게시판 (자유 / 업무공유 / 부서별)</h4></div>
          <table class="list-table">
            <thead><tr><th>게시판 분류</th><th>제목</th><th>작성자</th><th>작성일</th><th>댓글</th></tr></thead>
            <tbody>
              ${db.boardPosts.map(b => `
                <tr>
                  <td><span class="status-badge status-IN_PROGRESS">${b.category}</span></td>
                  <td><strong>${b.title}</strong></td>
                  <td>${b.author} (${b.dept})</td>
                  <td>${b.date}</td>
                  <td>${b.comments}개</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "schedule") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>🗓️ 회사 주요 일정</h4></div>
          <table class="list-table">
            <thead><tr><th>일정 구분</th><th>일정 제목</th><th>일자</th></tr></thead>
            <tbody>
              ${db.companyEvents.map(e => `
                <tr>
                  <td><span class="status-badge status-PENDING">${e.type}</span></td>
                  <td><strong>${e.title}</strong></td>
                  <td>${e.date}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "programs") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>💻 업무용 프로그램 설치 안내 (테스트 링크)</h4></div>
          <table class="list-table">
            <thead><tr><th>프로그램명</th><th>버전</th><th>설명</th><th>담당 문의</th><th>설치 안내</th></tr></thead>
            <tbody>
              ${db.programs.map(p => `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.version}</td>
                  <td>${p.desc}</td>
                  <td>${p.dept}</td>
                  <td><button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="App.showToast('테스트용 설치 안내 링크입니다: ${p.name}')">설치 안내 보기</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "archive") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>📁 전사 자료실</h4></div>
          <table class="list-table">
            <thead><tr><th>분류</th><th>파일명</th><th>등록자</th><th>등록일</th><th>크기</th><th>다운로드</th></tr></thead>
            <tbody>
              ${db.files.map(f => `
                <tr>
                  <td><span class="status-badge status-APPROVED">${f.category}</span></td>
                  <td><strong>${f.title}</strong></td>
                  <td>${f.author}</td>
                  <td>${f.date}</td>
                  <td>${f.size}</td>
                  <td><button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="App.showToast('시뮬레이션 다운로드: ${f.title}')">다운로드</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (pageKey === "admin") {
      container.innerHTML = `
        <div class="section-banner">
          ⚙️ <strong>[관리자 설정]</strong> 현재 관리자 권한(<strong>${user.name} ${user.position}</strong>)으로 접속 중입니다.
        </div>
        <div class="card">
          <div class="card-header"><h4>👥 전사 계정 및 권한 현황</h4></div>
          <table class="list-table">
            <thead><tr><th>아이디</th><th>이름</th><th>부서/직급</th><th>시스템 권한</th><th>총 연차</th><th>사용 연차</th></tr></thead>
            <tbody>
              ${db.users.map(u => `
                <tr>
                  <td><code>${u.id}</code></td>
                  <td><strong>${u.name}</strong></td>
                  <td>${u.dept} / ${u.position}</td>
                  <td><span class="status-badge status-IN_PROGRESS">${Auth.getRoleLabel(u.role)}</span></td>
                  <td>${u.annualTotal}일</td>
                  <td>${u.annualUsed}일</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    // 근태 관리 등 확장 예정 메뉴
    container.innerHTML = `
      <div class="card" style="text-align:center; padding:48px 20px;">
        <h3 style="font-size:18px; margin-bottom:8px;">🚧 [${PAGE_TITLES[pageKey]}] 기능 준비 중</h3>
        <p style="color:var(--text-muted); margin-bottom:18px;">
          해당 메뉴는 향후 확장 기능으로 준비 중입니다.
        </p>
        <button class="btn-primary" onclick="App.navigateTo('dashboard')">대시보드로 이동</button>
      </div>
    `;
  },

  showToast(msg) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2800);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
