/**
 * js/modules/dashboard.js (2단계: 실시간 Supabase DB 연동 대시보드 모듈)
 */
const DashboardModule = {
  render(container, user) {
    if (!container || !user) return;

    const db = StorageDB.getData();
    const myProfile = (db.users || []).find(u => u.id === user.id) || user;

    const totalLeave = Number(myProfile.annualTotal ?? 15);
    const usedLeave = Number(myProfile.annualUsed ?? 0);
    const remainLeave = Number((totalLeave - usedLeave).toFixed(1));

    const allLeaves = db.leaveRequests || [];

    // 1) 내가 지금 결재해야 할 차례인 문서 수
    const myTurnDocs = allLeaves.filter(doc => {
      const turn1 = (doc.status === "PENDING_1" || doc.status === "PENDING") && doc.approver1Id === user.id;
      const turn2 = (doc.status === "PENDING_2" || doc.status === "IN_PROGRESS") && doc.approver2Id === user.id;
      return turn1 || turn2;
    });

    // 2) 내가 신청해서 현재 결재 진행 중인 문서 수
    const myPendingDocs = allLeaves.filter(doc =>
      doc.applicantId === user.id && (doc.status === "PENDING_1" || doc.status === "PENDING_2" || doc.status === "PENDING" || doc.status === "IN_PROGRESS")
    );

    // 3) 승인 완료된 전체 재직자 수
    const activeUsersCount = (db.users || []).filter(u => u.approvalStatus === "APPROVED").length || 1;

    const recentLeaves = allLeaves.slice(0, 5);
    const recentNotices = (db.notices || []).slice(0, 5);

    container.innerHTML = `
      <!-- 상단 웰컴 배너 -->
      <div class="welcome-banner">
        <div>
          <h3>안녕하세요, ${myProfile.name} ${myProfile.position}님! 👋</h3>
          <p>${myProfile.dept} · ${Auth.getRoleLabel(myProfile.role)} | 오늘도 활기찬 하루 보내세요.</p>
        </div>
        <div class="banner-actions">
          <button type="button" class="btn-white" onclick="App.navigateTo('approval')">📝 휴가 신청하기</button>
          <button type="button" class="btn-white" style="background:rgba(255,255,255,0.18); color:#fff;" onclick="App.navigateTo('leave-calendar')">📅 휴가 캘린더 보기</button>
        </div>
      </div>

      <!-- 핵심 요약 KPI 카드 4종 (클릭 시 해당 메뉴로 즉시 이동) -->
      <div class="kpi-grid">
        <div class="kpi-card" onclick="App.navigateTo('approval')">
          <div class="kpi-label">🌴 나의 잔여 연차</div>
          <div class="kpi-value" style="color:#2563eb;">${remainLeave}일</div>
          <div class="kpi-sub">총 부여 ${totalLeave}일 / 사용 ${usedLeave}일</div>
        </div>

        <div class="kpi-card" onclick="App.navigateTo('approval')">
          <div class="kpi-label">✍️ 내 결재 차례 문서</div>
          <div class="kpi-value" style="color:${myTurnDocs.length > 0 ? '#dc2626' : '#0f172a'};">${myTurnDocs.length}건</div>
          <div class="kpi-sub">${myTurnDocs.length > 0 ? '즉시 승인이 필요한 문서가 있습니다' : '대기 중인 결재가 없습니다'}</div>
        </div>

        <div class="kpi-card" onclick="App.navigateTo('approval')">
          <div class="kpi-label">⏳ 내 상신 진행 중</div>
          <div class="kpi-value">${myPendingDocs.length}건</div>
          <div class="kpi-sub">상급자 결재 대기 중인 내 휴가</div>
        </div>

        <div class="kpi-card" onclick="App.navigateTo('organization')">
          <div class="kpi-label">🏢 재직 임직원 현황</div>
          <div class="kpi-value" style="color:#059669;">${activeUsersCount}명</div>
          <div class="kpi-sub">재직자 조직도 바로가기 ➔</div>
        </div>
      </div>

      <!-- 하단 2단 요약 테이블 (최근 전자결재 & 공지사항) -->
      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h4>📝 최근 휴가 및 결재 현황</h4>
            <button type="button" class="link-btn" onclick="App.navigateTo('approval')">전체보기 ➔</button>
          </div>
          <table class="list-table feed-table">
            <thead>
              <tr><th>신청자</th><th>구분 / 일수</th><th>기간</th><th class="col-badge">상태</th></tr>
            </thead>
            <tbody>
              ${recentLeaves.length === 0
                ? `<tr><td colspan="4" class="f-empty" style="text-align:center; padding:18px; color:#94a3b8;">최근 결재 내역이 없습니다.</td></tr>`
                : recentLeaves.map(doc => {
                  const actor = (typeof App !== "undefined" && typeof App.resolveLeaveActors === "function")
                    ? App.resolveLeaveActors(doc, db.users)
                    : { applicantName: doc.applicantName };
                  return `
                  <tr style="cursor:pointer;" onclick="App.navigateTo('approval')">
                    <td class="f-name"><strong>${actor.applicantName}</strong></td>
                    <td class="f-type">${doc.leaveType} (${doc.days}일)</td>
                    <td class="f-period" style="font-size:12px; color:#64748b;">${doc.startDate} ~ ${doc.endDate}</td>
                    <td class="f-status"><span class="status-badge status-${doc.status}">${App.getLeaveStatusLabel(doc.status)}</span></td>
                  </tr>
                `;}).join("")
              }
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-header">
            <h4>📢 최근 회사 공지사항</h4>
            <button type="button" class="link-btn" onclick="App.navigateTo('notice')">전체보기 ➔</button>
          </div>
          <table class="list-table feed-table">
            <thead>
              <tr><th class="col-badge col-tag">구분</th><th>제목</th><th>작성자</th><th>작성일</th></tr>
            </thead>
            <tbody>
              ${recentNotices.length === 0
                ? `<tr><td colspan="4" class="f-empty" style="text-align:center; padding:18px; color:#94a3b8;">등록된 공지사항이 없습니다.</td></tr>`
                : recentNotices.map(n => {
                  const authorInfo = (typeof App !== "undefined" && typeof App.resolvePostAuthor === "function")
                    ? App.resolvePostAuthor(n, db.users)
                    : { label: n.author };
                  return `
                  <tr style="cursor:pointer;" onclick="App.navigateTo('notice')">
                    <td class="f-badge">${n.pinned ? '<span class="status-badge status-REJECTED">중요</span>' : '<span class="status-badge status-IN_PROGRESS">공지</span>'}</td>
                    <td class="f-title"><strong>${n.title}</strong></td>
                    <td class="f-author">${authorInfo.label}</td>
                    <td class="f-date" style="font-size:12px; color:#64748b;">${n.date}</td>
                  </tr>
                `;}).join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
};