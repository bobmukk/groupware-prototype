/**
 * js/modules/dashboard.js
 * 1단계 핵심: 로그인 후 가장 먼저 나타나는 대시보드 렌더링 모듈
 * 각 위젯이나 카드를 클릭하면 관련 메뉴 페이지로 즉시 이동합니다.
 */

const DashboardModule = {
  render(container, currentUser) {
    const db = StorageDB.getData();

    // 1. 내가 올린 휴가 기안 현황
    const myRequests = db.leaveRequests.filter(r => r.applicantId === currentUser.id);

    // 2. 내가 지금 결재해야 하는 대기 문서 (순차 결재 기준 현재 차례가 나인 문서)
    const myPendingApprovals = db.leaveRequests.filter(r => {
      if (r.status === "APPROVED" || r.status === "REJECTED") return false;
      const currentStep = r.approvalLine[r.currentStepIndex];
      return currentStep && currentStep.userId === currentUser.id && currentStep.status === "WAITING";
    });

    // 3. 이번 달 최종 승인된 전사 휴가 일정 (대표님 최종 승인 완료건만)
    const approvedLeaves = db.leaveRequests.filter(r => r.status === "APPROVED");

    const remainAnnual = (currentUser.annualTotal - currentUser.annualUsed).toFixed(1);

    container.innerHTML = `
      <!-- 상단 환영 배너 -->
      <div class="welcome-banner">
        <div>
          <h3>안녕하세요, ${currentUser.name} ${currentUser.position}님! (${currentUser.dept})</h3>
          <p>현재 권한: <strong>${Auth.getRoleLabel(currentUser.role)}</strong> | 잔여 연차: <strong>${remainAnnual}일</strong> (총 ${currentUser.annualTotal}일 중 ${currentUser.annualUsed}일 사용)</p>
        </div>
        <div class="banner-actions">
          <button class="btn-white" data-goto="approval">✍️ 휴가 기안 작성하기</button>
          <button class="btn-white" data-goto="leave-calendar">📅 전사 휴가 캘린더 보기</button>
        </div>
      </div>

      <!-- 핵심 지표(KPI) 카드 4종 (클릭 시 각 메뉴로 이동) -->
      <div class="kpi-grid">
        <div class="kpi-card" data-goto="approval">
          <div class="kpi-label">내가 올린 휴가 기안</div>
          <div class="kpi-value">${myRequests.length}건</div>
          <div class="kpi-sub">전자결재 문서함 이동 →</div>
        </div>

        <div class="kpi-card" data-goto="approval">
          <div class="kpi-label">내가 결재할 대기 문서</div>
          <div class="kpi-value" style="color: ${myPendingApprovals.length > 0 ? 'var(--danger)' : 'var(--text-main)'}">
            ${myPendingApprovals.length}건
          </div>
          <div class="kpi-sub">${myPendingApprovals.length > 0 ? '⚡ 지금 결재가 필요합니다' : '대기 문서 없음'} →</div>
        </div>

        <div class="kpi-card" data-goto="leave-calendar">
          <div class="kpi-label">이번 달 승인된 휴가 일정</div>
          <div class="kpi-value">${approvedLeaves.length}건</div>
          <div class="kpi-sub">대표님 최종 승인 완료 기준 →</div>
        </div>

        <div class="kpi-card" data-goto="notice">
          <div class="kpi-label">최근 회사 공지사항</div>
          <div class="kpi-value">${db.notices.length}건</div>
          <div class="kpi-sub">필독 공지 확인하기 →</div>
        </div>
      </div>

      <!-- 하단 상세 위젯 6종 그리드 -->
      <div class="dashboard-grid">
        <!-- 위젯 1: 내가 결재해야 하는 문서 -->
        <div class="card">
          <div class="card-header">
            <h4>📌 나의 결재 대기 문서 (${myPendingApprovals.length})</h4>
            <button class="link-btn" data-goto="approval">전체보기 →</button>
          </div>
          ${myPendingApprovals.length === 0
            ? `<p style="color:var(--text-muted); font-size:13px; padding:12px 0;">현재 회원님의 결재 차례인 대기 문서가 없습니다.</p>`
            : `<table class="list-table">
                <thead>
                  <tr><th>문서번호</th><th>신청자</th><th>종류/기간</th><th>상태</th></tr>
                </thead>
                <tbody>
                  ${myPendingApprovals.map(doc => `
                    <tr style="cursor:pointer" data-goto="approval">
                      <td><strong>${doc.id}</strong></td>
                      <td>${doc.applicantName} (${doc.dept})</td>
                      <td>${doc.leaveType} (${doc.startDate} ~ ${doc.endDate})</td>
                      <td><span class="status-badge status-${doc.status}">내 결재 차례</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>`
          }
        </div>

        <!-- 위젯 2: 내가 올린 휴가 기안 진행 현황 -->
        <div class="card">
          <div class="card-header">
            <h4>📝 내가 올린 휴가 기안 진행 현황 (${myRequests.length})</h4>
            <button class="link-btn" data-goto="approval">기안함 이동 →</button>
          </div>
          ${myRequests.length === 0
            ? `<p style="color:var(--text-muted); font-size:13px; padding:12px 0;">상신한 휴가 신청서가 없습니다.</p>`
            : `<table class="list-table">
                <thead>
                  <tr><th>종류</th><th>휴가 기간</th><th>일수</th><th>결재 상태</th></tr>
                </thead>
                <tbody>
                  ${myRequests.map(doc => `
                    <tr style="cursor:pointer" data-goto="approval">
                      <td><strong>${doc.leaveType}</strong></td>
                      <td>${doc.startDate} ~ ${doc.endDate}</td>
                      <td>${doc.days}일</td>
                      <td><span class="status-badge status-${doc.status}">${this.getStatusLabel(doc.status)}</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>`
          }
        </div>

        <!-- 위젯 3: 이번 달 최종 승인된 휴가 일정 -->
        <div class="card">
          <div class="card-header">
            <h4>📅 이번 달 승인된 휴가 일정 (전사 공유)</h4>
            <button class="link-btn" data-goto="leave-calendar">휴가 캘린더 이동 →</button>
          </div>
          <table class="list-table">
            <thead>
              <tr><th>휴가자</th><th>부서</th><th>승인된 휴가 기간</th><th>비고</th></tr>
            </thead>
            <tbody>
              ${approvedLeaves.map(doc => `
                <tr style="cursor:pointer" data-goto="leave-calendar">
                  <td><strong>${doc.applicantName} ${doc.position}</strong></td>
                  <td>${doc.dept}</td>
                  <td>${doc.startDate} ~ ${doc.endDate} (${doc.days}일)</td>
                  <td><span class="status-badge status-APPROVED">최종승인</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <!-- 위젯 4: 최근 회사 공지사항 -->
        <div class="card">
          <div class="card-header">
            <h4>📢 최근 회사 공지사항</h4>
            <button class="link-btn" data-goto="notice">공지 더보기 →</button>
          </div>
          <table class="list-table">
            <thead>
              <tr><th>제목</th><th>작성자</th><th>작성일</th></tr>
            </thead>
            <tbody>
              ${db.notices.map(n => `
                <tr style="cursor:pointer" data-goto="notice">
                  <td>${n.pinned ? '📌 ' : ''}<strong>${n.title}</strong></td>
                  <td>${n.author}</td>
                  <td>${n.date}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <!-- 위젯 5: 최근 사내 게시판 글 -->
        <div class="card">
          <div class="card-header">
            <h4>💬 최근 사내 게시판 글</h4>
            <button class="link-btn" data-goto="board">게시판 이동 →</button>
          </div>
          <table class="list-table">
            <thead>
              <tr><th>분류</th><th>제목</th><th>작성자</th></tr>
            </thead>
            <tbody>
              ${db.boardPosts.map(b => `
                <tr style="cursor:pointer" data-goto="board">
                  <td><span class="status-badge status-IN_PROGRESS">${b.category}</span></td>
                  <td><strong>${b.title}</strong> (${b.comments})</td>
                  <td>${b.author}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <!-- 위젯 6: 주요 회사 일정 -->
        <div class="card">
          <div class="card-header">
            <h4>🗓️ 주요 회사 일정</h4>
            <button class="link-btn" data-goto="schedule">일정 캘린더 이동 →</button>
          </div>
          <table class="list-table">
            <thead>
              <tr><th>구분</th><th>일정명</th><th>날짜</th></tr>
            </thead>
            <tbody>
              ${db.companyEvents.map(ev => `
                <tr style="cursor:pointer" data-goto="schedule">
                  <td><span class="status-badge status-PENDING">${ev.type}</span></td>
                  <td><strong>${ev.title}</strong></td>
                  <td>${ev.date}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 대시보드 내부 카드/버튼 클릭 시 해당 메뉴로 라우팅 연결
    container.querySelectorAll("[data-goto]").forEach(el => {
      el.addEventListener("click", () => {
        const targetPage = el.getAttribute("data-goto");
        App.navigateTo(targetPage);
      });
    });
  },

  getStatusLabel(status) {
    const labels = {
      DRAFT: "작성 중",
      PENDING: "결재 대기",
      IN_PROGRESS: "결재 진행 중",
      REJECTED: "반려",
      APPROVED: "최종 승인 완료"
    };
    return labels[status] || status;
  }
};
