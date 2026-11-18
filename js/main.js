/**
 * js/main.js (4단계 최종 완성본: 결재자 2명 팝업 지정 + 순차 결재/실시간 알림 + 관리자 가입승인)
 */
const PAGE_TITLES = {
  "dashboard": "대시보드",
  "approval": "전자결재 및 휴가 신청",
  "leave-calendar": "전사 휴가 캘린더",
  "organization": "재직자 조직도",
  "notice": "회사 공지사항",
  "board": "사내 게시판",
  "admin": "가입승인 및 직원관리 (관리자 전용)"
};

const App = {
  currentPage: "dashboard",
  // 팝업에서 선택한 1차 결재자 및 최종 결재권자 임시 저장
  selectedApprover1: null,
  selectedApprover2: null,

  init() {
    StorageDB.init();
    this.bindGlobalEvents();
    const sessionUser = Auth.getCurrentUser();
    if (sessionUser) {
      this.enterApp(sessionUser);
    } else {
      this.showLoginScreen();
    }
  },

  renderQuickAccountButtons() {},
  populateHeaderSwitcher() {},

  bindGlobalEvents() {
    // 1. 로그인 제출
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const pw = document.getElementById("login-pw").value.trim();
      const errEl = document.getElementById("auth-error");

      const res = await Auth.login(email, pw);
      if (!res.success) {
        errEl.textContent = res.message;
        errEl.classList.remove("hidden");
        return;
      }
      errEl.classList.add("hidden");
      await StorageDB.syncFromCloud();
      this.showToast(`환영합니다, ${res.user.name} ${res.user.position}님!`);
      this.enterApp(res.user);
    });

    // 2. 회원가입 신청 제출 (성명 / 직급 / 부서 직접 기입 + 관리자 승인제)
    document.getElementById("signup-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("signup-name").value.trim();
      const pos = document.getElementById("signup-pos").value.trim();
      const dept = document.getElementById("signup-dept").value.trim();
      const email = document.getElementById("signup-email").value.trim();
      const pw = document.getElementById("signup-pw").value.trim();
      const errEl = document.getElementById("auth-error");

      const res = await Auth.signup(email, pw, name, pos, dept);
      if (!res.success) {
        errEl.textContent = res.message;
        errEl.classList.remove("hidden");
        return;
      }

      // 일반 직원 가입 신청 시 -> 관리자 승인 대기 안내 후 로그인 탭으로 전환
      if (res.pending) {
        alert(res.message);
        document.getElementById("signup-form").reset();
        SwitchAuthTab("login");
        return;
      }

      // 마스터 관리자(나) 가입 시 -> 즉시 로그인 진입
      await StorageDB.syncFromCloud();
      this.showToast("마스터 관리자 계정으로 가입 및 로그인되었습니다!");
      this.enterApp(res.user);
    });

    // 3. 좌측 사이드바 메뉴 이동
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => this.navigateTo(btn.getAttribute("data-page")));
    });

    document.getElementById("brand-home").addEventListener("click", () => this.navigateTo("dashboard"));

    // 4. 로그아웃
    document.getElementById("btn-logout").addEventListener("click", () => {
      Auth.logout();
      this.showLoginScreen();
    });

    // 5. 상단 실시간 알림 종(🔔) 토글 및 모두 읽음 처리
    const notifBtn = document.getElementById("btn-notif-toggle");
    const notifDropdown = document.getElementById("notif-dropdown");
    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle("hidden");
        this.renderNotificationDropdown();
      });
      document.addEventListener("click", () => notifDropdown.classList.add("hidden"));
      notifDropdown.addEventListener("click", (e) => e.stopPropagation());
    }

    const readAllBtn = document.getElementById("btn-notif-readall");
    if (readAllBtn) {
      readAllBtn.addEventListener("click", async () => {
        const user = Auth.getCurrentUser();
        if (user) {
          await StorageDB.markAllNotificationsRead(user.id);
          this.renderNotificationDropdown();
          this.showToast("모든 알림을 읽음 처리했습니다.");
        }
      });
    }

    // 6. 결재권자 선택 모달 팝업 닫기 및 확정 버튼
    const closeModalBtn = document.getElementById("btn-close-modal");
    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", () => {
        document.getElementById("approver-modal").classList.add("hidden");
      });
    }

    const confirmApproversBtn = document.getElementById("btn-confirm-approvers");
    if (confirmApproversBtn) {
      confirmApproversBtn.addEventListener("click", () => this.confirmApproverSelection());
    }
  },

  showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-layout").classList.add("hidden");
  },

  enterApp(user) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-layout").classList.remove("hidden");
    this.updateHeaderUserInfo(user);
    const db = StorageDB.getData();
    this.updateNotificationBadge(db.notifications || []);
    this.navigateTo("dashboard");
  },

  updateHeaderUserInfo(user) {
    document.getElementById("user-avatar").textContent = user.name.charAt(0);
    document.getElementById("user-name-display").textContent = `${user.name} ${user.position}`;
    document.getElementById("user-dept-display").textContent = `${user.dept} · ${Auth.getRoleLabel(user.role)}`;
  },

  // 상단 알림 배지 숫자 업데이트
  updateNotificationBadge(notifs) {
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    const unreadCount = (notifs || []).filter(n => !n.is_read).length;
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  },

  // 알림 드롭다운 목록 렌더링
  renderNotificationDropdown() {
    const db = StorageDB.getData();
    const listEl = document.getElementById("notif-list");
    if (!listEl) return;
    const notifs = db.notifications || [];

    if (notifs.length === 0) {
      listEl.innerHTML = `<div style="padding:18px; text-align:center; color:#94a3b8; font-size:13px;">새로운 알림이 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}">
        <div>${n.message}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${(n.created_at || "").slice(0, 16).replace("T", " ")}</div>
      </div>
    `).join("");
  },

  navigateTo(pageKey) {
    const user = Auth.getCurrentUser();
    if (!user) return this.showLoginScreen();
    this.currentPage = pageKey;

    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-page") === pageKey);
    });
    document.getElementById("current-page-title").textContent = PAGE_TITLES[pageKey] || "그룹웨어";
    const container = document.getElementById("page-content");

    if (pageKey === "dashboard") return DashboardModule.render(container, user);
    this.renderSubPageContent(container, pageKey, user);
  },

  // [핵심 3단계 기능] 재직자 목록 팝업 열기 및 상급자 2명 선택
  openApproverModal() {
    const db = StorageDB.getData();
    const user = Auth.getCurrentUser();
    // 승인 완료된 재직자 중 본인 제외한 목록 (단, 테스트 시 직원이 본인 1명뿐이면 본인도 표시)
    let activeUsers = (db.users || []).filter(u => u.approvalStatus !== "PENDING" && u.approvalStatus !== "REJECTED");
    if (activeUsers.length === 0) activeUsers = [user];

    const listEl = document.getElementById("approver-modal-list");
    const cur1 = this.selectedApprover1 ? this.selectedApprover1.id : "";
    const cur2 = this.selectedApprover2 ? this.selectedApprover2.id : "";

    listEl.innerHTML = `
      <div style="margin-bottom:14px;">
        <label style="display:block; font-weight:700; font-size:13px; margin-bottom:6px; color:#1e3a8a;">① 1차 결재자 (검토자) 선택</label>
        <select id="modal-select-ap1" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">
          <option value="">-- 재직자 목록에서 1차 결재자 선택 --</option>
          ${activeUsers.map(u => `
            <option value="${u.id}" ${u.id === cur1 ? "selected" : ""}>[${u.dept}] ${u.name} ${u.position} (${u.email || ""})</option>
          `).join("")}
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block; font-weight:700; font-size:13px; margin-bottom:6px; color:#047857;">② 최종 결재권자 (승인자) 선택</label>
        <select id="modal-select-ap2" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">
          <option value="">-- 재직자 목록에서 최종 결재권자 선택 --</option>
          ${activeUsers.map(u => `
            <option value="${u.id}" ${u.id === cur2 ? "selected" : ""}>[${u.dept}] ${u.name} ${u.position} (${u.email || ""})</option>
          `).join("")}
        </select>
      </div>
      <div style="font-size:12px; color:#64748b; background:#f8fafc; padding:10px; border-radius:8px;">
        💡 <strong>현재 승인된 재직자 (${activeUsers.length}명):</strong><br/>
        ${activeUsers.map(u => `• ${u.name} ${u.position} (${u.dept})`).join("<br/>")}
      </div>
    `;

    document.getElementById("approver-modal").classList.remove("hidden");
  },

  confirmApproverSelection() {
    const db = StorageDB.getData();
    const id1 = document.getElementById("modal-select-ap1").value;
    const id2 = document.getElementById("modal-select-ap2").value;

    if (!id1 || !id2) {
      return alert("1차 결재자와 최종 결재권자 2명을 모두 선택해 주세요.");
    }

    this.selectedApprover1 = db.users.find(u => u.id === id1);
    this.selectedApprover2 = db.users.find(u => u.id === id2);

    document.getElementById("approver-modal").classList.add("hidden");
    const displayEl = document.getElementById("selected-approvers-display");
    if (displayEl && this.selectedApprover1 && this.selectedApprover2) {
      displayEl.innerHTML = `
        <span class="status-badge status-IN_PROGRESS">1차: ${this.selectedApprover1.name} ${this.selectedApprover1.position}</span>
        ➔
        <span class="status-badge status-APPROVED">최종: ${this.selectedApprover2.name} ${this.selectedApprover2.position}</span>
      `;
    }
    this.showToast("결재권자 2명이 지정되었습니다.");
  },

  renderSubPageContent(container, pageKey, user) {
    const db = StorageDB.getData();

    // 1. 전자결재 및 휴가 신청 (결재권자 선택 팝업 + 순차 결재 + RLS 적용 목록)
    if (pageKey === "approval") {
      const ap1Text = this.selectedApprover1 ? `${this.selectedApprover1.name} ${this.selectedApprover1.position}` : "미지정";
      const ap2Text = this.selectedApprover2 ? `${this.selectedApprover2.name} ${this.selectedApprover2.position}` : "미지정";

      container.innerHTML = `
        <div class="card" style="margin-bottom:18px;">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h4>✍️ 휴가 신청서 작성 (RLS 보안 및 순차 결재 적용)</h4>
            <button type="button" class="btn-primary" id="btn-open-approver-popup" style="background:#0f172a;">
              👥 재직자 목록에서 결재권자 2명 선택
            </button>
          </div>

          <div style="background:#f8fafc; padding:12px 14px; border-radius:8px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
            <div style="font-size:13px; font-weight:600; color:#334155;">지정된 결재선 (1차 ➔ 최종):</div>
            <div id="selected-approvers-display" style="font-size:13px;">
              ${this.selectedApprover1 && this.selectedApprover2
                ? `<span class="status-badge status-IN_PROGRESS">1차: ${ap1Text}</span> ➔ <span class="status-badge status-APPROVED">최종: ${ap2Text}</span>`
                : `<span style="color:#ef4444; font-weight:600;">우측 상단 [결재권자 2명 선택] 버튼을 눌러 상급자를 지정하세요</span>`}
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:8px;">
            <select id="ap-type" style="padding:9px; border:1px solid #cbd5e1; border-radius:6px;">
              <option value="연차">연차</option>
              <option value="오전반차">오전반차 (0.5일)</option>
              <option value="오후반차">오후반차 (0.5일)</option>
              <option value="병가/기타">병가/기타휴가</option>
            </select>
            <input type="date" id="ap-start" value="2026-11-23" style="padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
            <input type="date" id="ap-end" value="2026-11-25" style="padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
          </div>
          <div style="display:flex; gap:8px;">
            <input type="text" id="ap-reason" placeholder="휴가 사유를 입력하세요 (RLS 정책으로 본인과 결재자에게만 공개됩니다)" style="flex:1; padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button class="btn-primary" id="btn-submit-ap">휴가 상신하기</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>📝 결재 문서 목록 (본인 신청 건 및 내 결재 차례 문서)</h4></div>
          <table class="list-table">
            <thead><tr><th>신청자</th><th>휴가종류 / 기간</th><th>1차 결재자</th><th>최종 결재권자</th><th>현재 상태</th><th>결재 처리</th></tr></thead>
            <tbody>
              ${(db.leaveRequests || []).length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">조회된 휴가 신청 내역이 없습니다.</td></tr>` : ""}
              ${(db.leaveRequests || []).map(doc => {
                // 순차 결재 조건 확인:
                // 1) 상태가 PENDING_1 이고 내가 1차 결재자(approver1Id)일 때 -> 1차 승인/반려 버튼 표시
                // 2) 상태가 PENDING_2(1차 승인 완료) 이고 내가 최종 결재자(approver2Id)일 때 -> 최종 승인/반려 버튼 표시
                const isTurnStep1 = (doc.status === "PENDING_1" || doc.status === "PENDING") && doc.approver1Id === user.id;
                const isTurnStep2 = (doc.status === "PENDING_2" || doc.status === "IN_PROGRESS") && doc.approver2Id === user.id;

                return `
                  <tr>
                    <td><strong>${doc.applicantName}</strong><br/><span style="font-size:12px; color:#64748b;">${doc.dept} · ${doc.position}</span></td>
                    <td><strong>${doc.leaveType}</strong> (${doc.days}일)<br/><span style="font-size:12px; color:#64748b;">${doc.startDate} ~ ${doc.endDate}</span></td>
                    <td>${doc.approver1Name || "-"}<br/><span style="font-size:11px;">${doc.approver1Status === "APPROVED" ? "✅ 1차승인" : doc.approver1Status === "REJECTED" ? "❌ 반려" : "⏳ 대기"}</span></td>
                    <td>${doc.approver2Name || "-"}<br/><span style="font-size:11px;">${doc.approver2Status === "APPROVED" ? "✅ 최종승인" : doc.approver2Status === "REJECTED" ? "❌ 반려" : "⏳ 대기"}</span></td>
                    <td><span class="status-badge status-${doc.status}">${this.getLeaveStatusLabel(doc.status)}</span></td>
                    <td>
                      ${isTurnStep1 ? `
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="App.handleSequentialApproval('${doc.id}', 1, true)">1차 승인</button>
                        <button class="btn-logout" style="padding:5px 10px; font-size:12px; color:#dc2626;" onclick="App.handleSequentialApproval('${doc.id}', 1, false)">반려</button>
                      ` : isTurnStep2 ? `
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px; background:#059669;" onclick="App.handleSequentialApproval('${doc.id}', 2, true)">최종 승인</button>
                        <button class="btn-logout" style="padding:5px 10px; font-size:12px; color:#dc2626;" onclick="App.handleSequentialApproval('${doc.id}', 2, false)">반려</button>
                      ` : `<span style="font-size:12px; color:#94a3b8;">-</span>`}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById("btn-open-approver-popup").onclick = () => this.openApproverModal();

      document.getElementById("btn-submit-ap").onclick = async () => {
        if (!this.selectedApprover1 || !this.selectedApprover2) {
          return alert("먼저 [재직자 목록에서 결재권자 2명 선택] 버튼을 눌러 1차 및 최종 결재권자를 지정해 주세요.");
        }
        const leaveType = document.getElementById("ap-type").value;
        const startDate = document.getElementById("ap-start").value;
        const endDate = document.getElementById("ap-end").value;
        const reason = document.getElementById("ap-reason").value.trim();

        if (!startDate || !endDate || !reason) return alert("휴가 기간과 사유를 모두 입력해 주세요.");
        if (endDate < startDate) return alert("종료일이 시작일보다 빠를 수 없습니다.");

        const diffDays = Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
        const days = leaveType.includes("반차") ? 0.5 : diffDays;

        try {
          await StorageDB.createLeaveRequest({
            applicant_id: user.id,
            applicant_name: user.name,
            dept: user.dept,
            position: user.position,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            days,
            reason,
            approver1_id: this.selectedApprover1.id,
            approver1_name: `${this.selectedApprover1.name} ${this.selectedApprover1.position}`,
            approver1_status: "WAITING",
            approver2_id: this.selectedApprover2.id,
            approver2_name: `${this.selectedApprover2.name} ${this.selectedApprover2.position}`,
            approver2_status: "WAITING",
            status: "PENDING_1"
          });
          this.showToast("휴가 신청서가 상신되었으며 1차 결재자에게 알림이 발송되었습니다!");
          this.navigateTo("approval");
        } catch (err) {
          alert(err.message);
        }
      };
      return;
    }

    // 2. 관리자 전용: 가입 승인 및 직원 관리 페이지
    if (pageKey === "admin") {
      if (!Auth.isAdmin(user)) {
        container.innerHTML = `<div class="card"><h3>⛔ 시스템 관리자(또는 대표이사)만 접근할 수 있는 메뉴입니다.</h3></div>`;
        return;
      }

      const allUsers = db.users || [];
      const pendingUsers = allUsers.filter(u => u.approvalStatus === "PENDING");

      container.innerHTML = `
        <div class="card" style="margin-bottom:18px; border-left:4px solid #f59e0b;">
          <div class="card-header"><h4>⏳ 신규 가입 승인 대기 목록 (${pendingUsers.length}명)</h4></div>
          ${pendingUsers.length === 0
            ? `<p style="font-size:13px; color:#64748b;">현재 승인 대기 중인 가입 신청자가 없습니다.</p>`
            : `<table class="list-table">
                <thead><tr><th>이름</th><th>부서 / 직급</th><th>이메일</th><th>상태</th><th>승인 처리</th></tr></thead>
                <tbody>
                  ${pendingUsers.map(u => `
                    <tr>
                      <td><strong>${u.name}</strong></td>
                      <td>${u.dept} · ${u.position}</td>
                      <td>${u.email}</td>
                      <td><span class="status-badge status-PENDING">승인 대기</span></td>
                      <td>
                        <button class="btn-primary" style="padding:5px 10px; font-size:12px; background:#10b981;" onclick="App.approveUserAccount('${u.id}', 'APPROVED')">✅ 사용 승인</button>
                        <button class="btn-logout" style="padding:5px 10px; font-size:12px; color:#dc2626;" onclick="App.approveUserAccount('${u.id}', 'REJECTED')">⛔ 가입 반려</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>`
          }
        </div>

        <div class="card">
          <div class="card-header"><h4>👥 전체 재직자 명부 및 권한 관리 (${allUsers.length}명)</h4></div>
          <table class="list-table">
            <thead><tr><th>이름</th><th>부서</th><th>직급</th><th>이메일</th><th>시스템 권한</th><th>가입 상태</th></tr></thead>
            <tbody>
              ${allUsers.map(u => `
                <tr>
                  <td><strong>${u.name}</strong></td>
                  <td>${u.dept}</td>
                  <td>${u.position}</td>
                  <td>${u.email || "-"}</td>
                  <td>${Auth.getRoleLabel(u.role)}</td>
                  <td>${u.approvalStatus === "APPROVED" ? "✅ 정상(승인됨)" : u.approvalStatus === "PENDING" ? "⏳ 승인대기" : "⛔ 반려됨"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    // 3. 휴가 캘린더 (최종 승인된 일정만 가로 막대 ━━━━ 표시)
    if (pageKey === "leave-calendar") {
      const approved = (db.leaveRequests || []).filter(r => r.status === "APPROVED");
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>📅 최종 승인된 전사 휴가 캘린더 (연속 가로선 ━━━━ 시각화)</h4></div>
          <div style="display:flex; flex-direction:column; gap:10px; padding:10px 0;">
            ${approved.length === 0 ? `<p style="color:#94a3b8; font-size:13px;">아직 최종 승인된 휴가 일정이 없습니다.</p>` : ""}
            ${approved.map(a => `
              <div style="display:flex; align-items:center; gap:12px; background:#eff6ff; border-left:4px solid #2563eb; padding:10px 14px; border-radius:6px;">
                <strong style="min-width:120px; color:#1e3a8a;">${a.applicantName} (${a.leaveType})</strong>
                <div style="flex:1; display:flex; align-items:center; gap:8px;">
                  <span style="font-size:12px; font-weight:700; color:#2563eb;">${a.startDate}</span>
                  <div style="flex:1; height:6px; background:#2563eb; border-radius:99px;"></div>
                  <span style="font-size:12px; font-weight:700; color:#2563eb;">${a.endDate} (${a.days}일간)</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
      return;
    }

    // 4. 재직자 조직도 (승인 완료된 직원만 표시)
    if (pageKey === "organization") {
      const approvedUsers = (db.users || []).filter(u => u.approvalStatus !== "PENDING" && u.approvalStatus !== "REJECTED");
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>🏢 사내 재직자 조직도 (${approvedUsers.length}명)</h4></div>
          <table class="list-table">
            <thead><tr><th>부서</th><th>성명</th><th>직급</th><th>이메일</th></tr></thead>
            <tbody>
              ${approvedUsers.map(u => `<tr><td><strong>${u.dept}</strong></td><td>${u.name}</td><td>${u.position}</td><td>${u.email || "-"}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    // 5. 사내 게시판
    if (pageKey === "board") {
      container.innerHTML = `
        <div class="card" style="margin-bottom:18px;">
          <div class="card-header"><h4>✍️ 사내 게시판 새 글 작성 (${user.name} ${user.position})</h4></div>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <select id="b-cat" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
              <option value="자유 게시판">자유 게시판</option>
              <option value="업무 공유 게시판">업무 공유 게시판</option>
              <option value="부서별 게시판">부서별 게시판</option>
            </select>
            <input id="b-title" type="text" placeholder="제목을 입력하세요" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button class="btn-primary" id="btn-save-board">게시글 등록</button>
          </div>
          <textarea id="b-content" rows="2" placeholder="내용을 입력하세요" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
        </div>
        <div class="card">
          <div class="card-header"><h4>💬 전체 게시글 목록 (${(db.boardPosts || []).length}건)</h4></div>
          <table class="list-table">
            <thead><tr><th>분류</th><th>제목 / 내용</th><th>작성자</th><th>작성일</th><th>관리</th></tr></thead>
            <tbody>
              ${(db.boardPosts || []).map((b, idx) => `
                <tr>
                  <td><span class="status-badge status-IN_PROGRESS">${b.category}</span></td>
                  <td><strong>${b.title}</strong><br/><span style="color:#64748b; font-size:12px;">${b.content || ""}</span></td>
                  <td>${b.author}</td>
                  <td>${b.date}</td>
                  <td>${b.author.includes(user.name) ? `<button class="link-btn" onclick="App.deleteBoard(${idx})">삭제</button>` : "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById("btn-save-board").onclick = () => {
        const title = document.getElementById("b-title").value.trim();
        const content = document.getElementById("b-content").value.trim();
        const category = document.getElementById("b-cat").value;
        if (!title) return alert("제목을 입력해 주세요.");
        db.boardPosts.unshift({
          id: "B-" + Date.now(),
          category,
          title,
          content,
          author: `${user.name} ${user.position}`,
          dept: user.dept,
          date: new Date().toISOString().slice(0, 10)
        });
        StorageDB.saveData(db);
        this.showToast("게시글이 등록되었습니다.");
        this.navigateTo("board");
      };
      return;
    }

    // 6. 회사 공지사항
    if (pageKey === "notice") {
      container.innerHTML = `
        <div class="card" style="margin-bottom:18px;">
          <div class="card-header"><h4>📢 신규 공지사항 등록</h4></div>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input id="n-title" type="text" placeholder="공지 제목을 입력하세요" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <label style="display:flex; align-items:center; gap:4px;"><input type="checkbox" id="n-pin" /> 상단고정</label>
            <button class="btn-primary" id="btn-save-notice">공지 등록</button>
          </div>
          <textarea id="n-content" rows="2" placeholder="공지 상세 내용" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
        </div>
        <div class="card">
          <table class="list-table">
            <thead><tr><th>구분</th><th>제목 / 내용</th><th>작성자</th><th>작성일</th></tr></thead>
            <tbody>
              ${(db.notices || []).map(n => `
                <tr>
                  <td>${n.pinned ? '<span class="status-badge status-REJECTED">중요</span>' : '일반'}</td>
                  <td><strong>${n.title}</strong><br/><span style="color:#64748b; font-size:12px;">${n.content}</span></td>
                  <td>${n.author}</td>
                  <td>${n.date}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById("btn-save-notice").onclick = () => {
        const title = document.getElementById("n-title").value.trim();
        const content = document.getElementById("n-content").value.trim();
        const pinned = document.getElementById("n-pin").checked;
        if (!title) return alert("공지 제목을 입력해 주세요.");
        db.notices.unshift({
          id: "N-" + Date.now(),
          title,
          content,
          pinned,
          author: `${user.name} ${user.position}`,
          date: new Date().toISOString().slice(0, 10)
        });
        StorageDB.saveData(db);
        this.showToast("공지사항이 등록되었습니다.");
        this.navigateTo("notice");
      };
      return;
    }
  },

  getLeaveStatusLabel(status) {
    const map = {
      PENDING_1: "1차 결재 대기",
      PENDING_2: "1차 승인 (최종 대기)",
      APPROVED: "최종 승인 완료",
      REJECTED: "결재 반려",
      PENDING: "1차 결재 대기",
      IN_PROGRESS: "최종 결재 대기"
    };
    return map[status] || status;
  },

  // [핵심 4단계 로직] 순차적 결재 승인/반려 처리 및 다음 결재자 알림 발송
  async handleSequentialApproval(docId, stepNumber, isApprove) {
    const db = StorageDB.getData();
    const doc = (db.leaveRequests || []).find(d => String(d.id) === String(docId));
    if (!doc) return;

    try {
      await StorageDB.processLeaveApproval(doc, stepNumber, isApprove);
      if (!isApprove) {
        this.showToast("결재가 반려 처리되었으며 신청자에게 알림이 발송되었습니다.");
      } else if (stepNumber === 1) {
        this.showToast("✅ 1차 승인 완료! 최종 결재권자에게 결재 요청 알림이 발송되었습니다.");
      } else {
        this.showToast("🎉 최종 승인 완료! 전사 휴가 캘린더에 등록되었습니다.");
      }
      this.navigateTo("approval");
    } catch (err) {
      alert(err.message);
    }
  },

  // 관리자 전용: 신규 가입 신청자 승인/반려 처리
  async approveUserAccount(targetUserId, newStatus) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetUserId}`, {
        method: "PATCH",
        headers: StorageDB.getHeaders(true),
        body: JSON.stringify({ approval_status: newStatus })
      });
      if (!res.ok) throw new Error("상태 변경 실패");

      await StorageDB.syncFromCloud();
      this.showToast(newStatus === "APPROVED" ? "✅ 직원 계정 사용 승인이 완료되었습니다!" : "⛔ 가입 신청이 반려되었습니다.");
      this.navigateTo("admin");
    } catch (err) {
      alert(err.message);
    }
  },

  deleteBoard(idx) {
    const db = StorageDB.getData();
    db.boardPosts.splice(idx, 1);
    StorageDB.saveData(db);
    this.showToast("게시글이 삭제되었습니다.");
    this.navigateTo("board");
  },

  showToast(msg) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());