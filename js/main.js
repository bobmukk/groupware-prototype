/**
 * js/main.js (실시간 연차 자동 계산기 + 상단 헤더 잔여연차 배너 + 내 정보 수정 + 관리자 연차 부여 통합본)
 */
const PAGE_TITLES = {
  "dashboard": "대시보드",
  "approval": "전자결재 및 휴가 신청",
  "leave-calendar": "전사 휴가 캘린더",
  "organization": "재직자 조직도",
  "notice": "회사 공지사항",
  "board": "사내 게시판",
  "admin": "가입승인 및 임직원 연차관리 (관리자 전용)"
};

const App = {
  currentPage: "dashboard",
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
    // 1. 로그인
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
      this.enterApp(Auth.getCurrentUser() || res.user);
    });

    // 2. 회원가입
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

      if (res.pending) {
        alert(res.message);
        document.getElementById("signup-form").reset();
        SwitchAuthTab("login");
        return;
      }

      await StorageDB.syncFromCloud();
      this.showToast("마스터 관리자 계정으로 가입 및 로그인되었습니다!");
      this.enterApp(res.user);
    });

    // 3. 사이드바 이동
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => this.navigateTo(btn.getAttribute("data-page")));
    });

    document.getElementById("brand-home").addEventListener("click", () => this.navigateTo("dashboard"));

    // 4. 로그아웃
    document.getElementById("btn-logout").addEventListener("click", () => {
      Auth.logout();
      this.showLoginScreen();
    });

    // 5. 실시간 알림 드롭다운
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

    // 6. 결재권자 선택 모달 이벤트
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

    // 7. 상단 헤더 프로필 클릭 -> 내 정보 및 연차 확인/수정 모달 오픈
    const openProfBtn = document.getElementById("btn-open-profile");
    if (openProfBtn) {
      openProfBtn.addEventListener("click", () => this.openProfileModal());
    }
    const closeProfBtn = document.getElementById("btn-close-profile-modal");
    if (closeProfBtn) {
      closeProfBtn.addEventListener("click", () => {
        document.getElementById("profile-modal").classList.add("hidden");
      });
    }
    const saveProfBtn = document.getElementById("btn-save-profile");
    if (saveProfBtn) {
      saveProfBtn.addEventListener("click", () => this.saveMyProfileChanges());
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

  // 상단 헤더: [이름 직급 | 부서 | 잔여 연차] 배너 실시간 표시
  updateHeaderUserInfo(user) {
    if (!user) return;
    const total = Number(user.annualTotal ?? 15);
    const used = Number(user.annualUsed ?? 0);
    const remain = Number((total - used).toFixed(1));

    document.getElementById("user-avatar").textContent = (user.name || "사").charAt(0);
    document.getElementById("user-name-display").textContent = `${user.name} ${user.position}`;
    document.getElementById("user-dept-display").textContent = `${user.dept} · ${Auth.getRoleLabel(user.role)}`;

    const leaveBadge = document.getElementById("header-leave-badge");
    if (leaveBadge) {
      leaveBadge.innerHTML = `🌴 잔여 연차: <strong>${remain}일</strong> <span style="font-weight:400; color:#64748b;">(총 ${total}일)</span>`;
    }
  },

  // 상단 프로필 클릭 시 열리는 내 정보 & 연차 요약 팝업
  openProfileModal() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const db = StorageDB.getData();
    const myRow = (db.users || []).find(u => u.id === user.id) || user;

    const total = Number(myRow.annualTotal ?? 15);
    const used = Number(myRow.annualUsed ?? 0);
    const remain = Number((total - used).toFixed(1));

    document.getElementById("profile-leave-summary").innerHTML = `
      <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
        <div style="font-size:12px; color:#64748b;">총 부여 연차</div>
        <strong style="font-size:18px; color:#0f172a;">${total}일</strong>
      </div>
      <div style="background:#fef2f2; padding:10px; border-radius:8px; border:1px solid #fecaca;">
        <div style="font-size:12px; color:#dc2626;">사용 연차</div>
        <strong style="font-size:18px; color:#dc2626;">${used}일</strong>
      </div>
      <div style="background:#eff6ff; padding:10px; border-radius:8px; border:1px solid #bfdbfe;">
        <div style="font-size:12px; color:#1d4ed8;">잔여 연차</div>
        <strong style="font-size:18px; color:#1d4ed8;">${remain}일</strong>
      </div>
    `;

    document.getElementById("prof-email").value = myRow.email || "";
    document.getElementById("prof-name").value = myRow.name || "";
    document.getElementById("prof-pos").value = myRow.position || "";
    document.getElementById("prof-dept").value = myRow.dept || "";
    document.getElementById("prof-phone").value = myRow.phone || "";

    document.getElementById("profile-modal").classList.remove("hidden");
  },

  async saveMyProfileChanges() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const name = document.getElementById("prof-name").value.trim();
    const position = document.getElementById("prof-pos").value.trim();
    const dept = document.getElementById("prof-dept").value.trim();
    const phone = document.getElementById("prof-phone").value.trim();

    if (!name || !position || !dept) return alert("성명, 직급, 부서를 모두 입력해 주세요.");

    try {
      await StorageDB.updateMyProfile(user.id, { name, position, dept, phone });
      document.getElementById("profile-modal").classList.add("hidden");
      this.showToast("내 프로필 정보가 수정되었습니다.");
      this.navigateTo(this.currentPage);
    } catch (err) {
      alert(err.message);
    }
  },

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
    this.updateHeaderUserInfo(user);

    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-page") === pageKey);
    });
    document.getElementById("current-page-title").textContent = PAGE_TITLES[pageKey] || "그룹웨어";
    const container = document.getElementById("page-content");

    if (pageKey === "dashboard") return DashboardModule.render(container, user);
    this.renderSubPageContent(container, pageKey, user);
  },

  openApproverModal() {
    const db = StorageDB.getData();
    const user = Auth.getCurrentUser();
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
    `;

    document.getElementById("approver-modal").classList.remove("hidden");
  },

  confirmApproverSelection() {
    const db = StorageDB.getData();
    const id1 = document.getElementById("modal-select-ap1").value;
    const id2 = document.getElementById("modal-select-ap2").value;

    if (!id1 || !id2) return alert("1차 결재자와 최종 결재권자 2명을 모두 선택해 주세요.");

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
    const myProfile = (db.users || []).find(u => u.id === user.id) || user;
    const totalLeave = Number(myProfile.annualTotal ?? 15);
    const usedLeave = Number(myProfile.annualUsed ?? 0);
    const remainLeave = Number((totalLeave - usedLeave).toFixed(1));

    // 1. 전자결재 및 휴가 신청 (실시간 연차 자동 계산기 포함)
    if (pageKey === "approval") {
      const ap1Text = this.selectedApprover1 ? `${this.selectedApprover1.name} ${this.selectedApprover1.position}` : "미지정";
      const ap2Text = this.selectedApprover2 ? `${this.selectedApprover2.name} ${this.selectedApprover2.position}` : "미지정";
      const todayStr = new Date().toISOString().slice(0, 10);

      container.innerHTML = `
        <!-- 내 연차 현황 및 실시간 차감 계산 배너 -->
        <div class="card" style="margin-bottom:18px; background:linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); border:1px solid #bfdbfe;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="color:#1e3a8a; margin:0;">🌴 ${user.name} ${user.position}님의 연차 현황 및 실시간 차감 계산</h4>
            <span style="font-size:12px; color:#475569;">※ 최종 결재 승인 시 잔여 연차에서 자동 차감됩니다.</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; text-align:center;">
            <div style="background:#fff; padding:12px; border-radius:10px; border:1px solid #e2e8f0;">
              <div style="font-size:12px; color:#64748b; margin-bottom:4px;">총 부여 연차</div>
              <strong style="font-size:20px; color:#0f172a;">${totalLeave}일</strong>
            </div>
            <div style="background:#fff; padding:12px; border-radius:10px; border:1px solid #e2e8f0;">
              <div style="font-size:12px; color:#64748b; margin-bottom:4px;">기사용 연차</div>
              <strong style="font-size:20px; color:#64748b;">${usedLeave}일</strong>
            </div>
            <div style="background:#fff; padding:12px; border-radius:10px; border:2px solid #3b82f6;">
              <div style="font-size:12px; color:#1d4ed8; font-weight:700; margin-bottom:4px;">현재 잔여 연차</div>
              <strong style="font-size:20px; color:#1d4ed8;">${remainLeave}일</strong>
            </div>
            <div style="background:#fff; padding:12px; border-radius:10px; border:2px solid #10b981;">
              <div style="font-size:12px; color:#047857; font-weight:700; margin-bottom:4px;">금번 차감 ➔ 예상 잔여</div>
              <strong id="calc-preview-text" style="font-size:18px; color:#047857;">-1일 ➔ ${(remainLeave - 1).toFixed(1)}일</strong>
            </div>
          </div>
        </div>

        <!-- 휴가 기안 작성 카드 -->
        <div class="card" style="margin-bottom:18px;">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h4>✍️ 휴가 신청서 작성</h4>
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
            <div>
              <label style="font-size:12px; color:#64748b; display:block; margin-bottom:4px;">휴가 구분</label>
              <select id="ap-type" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:6px;">
                <option value="연차">연차 (일수 차감)</option>
                <option value="오전반차">오전반차 (0.5일 차감)</option>
                <option value="오후반차">오후반차 (0.5일 차감)</option>
                <option value="경조/공가(연차미차감)">경조/공가 (연차 미차감)</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px; color:#64748b; display:block; margin-bottom:4px;">시작일</label>
              <input type="date" id="ap-start" value="${todayStr}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
            </div>
            <div>
              <label style="font-size:12px; color:#64748b; display:block; margin-bottom:4px;">종료일</label>
              <input type="date" id="ap-end" value="${todayStr}" style="width:100%; padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" id="ap-reason" placeholder="휴가 사유를 입력하세요 (본인과 결재자에게만 공개됩니다)" style="flex:1; padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button class="btn-primary" id="btn-submit-ap">휴가 상신하기</button>
          </div>
        </div>

        <!-- 결재 문서 목록 -->
        <div class="card">
          <div class="card-header"><h4>📝 결재 문서 목록 (본인 신청 건 및 내 결재 차례 문서)</h4></div>
          <table class="list-table">
            <thead><tr><th>신청자</th><th>휴가종류 / 차감일수</th><th>1차 결재자</th><th>최종 결재권자</th><th>현재 상태</th><th>결재 처리</th></tr></thead>
            <tbody>
              ${(db.leaveRequests || []).length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">조회된 휴가 신청 내역이 없습니다.</td></tr>` : ""}
              ${(db.leaveRequests || []).map(doc => {
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

      // 실시간 일수 및 예상 잔여 연차 자동 계산 함수
      const updateLeavePreview = () => {
        const typeVal = document.getElementById("ap-type").value;
        const startVal = document.getElementById("ap-start").value;
        const endInput = document.getElementById("ap-end");
        const previewEl = document.getElementById("calc-preview-text");

        if (typeVal.includes("반차")) {
          endInput.value = startVal;
        }
        const endVal = endInput.value;

        let reqDays = 0;
        if (typeVal.includes("미차감")) {
          reqDays = 0;
        } else if (typeVal.includes("반차")) {
          reqDays = 0.5;
        } else if (startVal && endVal && endVal >= startVal) {
          reqDays = Math.floor((new Date(endVal) - new Date(startVal)) / (1000 * 60 * 60 * 24)) + 1;
        }

        const expectedRemain = Number((remainLeave - reqDays).toFixed(1));
        if (expectedRemain < 0) {
          previewEl.style.color = "#dc2626";
          previewEl.textContent = `-${reqDays}일 ➔ 잔여 부족 (${expectedRemain}일)`;
        } else {
          previewEl.style.color = "#047857";
          previewEl.textContent = `-${reqDays}일 ➔ ${expectedRemain}일 남음`;
        }
        return { reqDays, expectedRemain };
      };

      document.getElementById("ap-type").addEventListener("change", updateLeavePreview);
      document.getElementById("ap-start").addEventListener("change", updateLeavePreview);
      document.getElementById("ap-end").addEventListener("change", updateLeavePreview);
      updateLeavePreview();

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

        const { reqDays, expectedRemain } = updateLeavePreview();
        if (expectedRemain < 0) {
          return alert(`잔여 연차(${remainLeave}일)가 부족하여 ${reqDays}일 휴가를 신청할 수 없습니다.`);
        }

        try {
          await StorageDB.createLeaveRequest({
            applicant_id: user.id,
            applicant_name: user.name,
            dept: user.dept,
            position: user.position,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            days: reqDays,
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

    // 2. 관리자 전용: 가입 승인 + 전 직원 일괄 연차 부여 + 직원별 연차/직급 조정
    if (pageKey === "admin") {
      if (!Auth.isAdmin(user)) {
        container.innerHTML = `<div class="card"><h3>⛔ 시스템 관리자(또는 대표이사)만 접근할 수 있는 메뉴입니다.</h3></div>`;
        return;
      }

      const allUsers = db.users || [];
      const pendingUsers = allUsers.filter(u => u.approvalStatus === "PENDING");

      container.innerHTML = `
        <!-- 신규 가입 승인 대기 -->
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

        <!-- 전 직원 일괄 연차 부여 -->
        <div class="card" style="margin-bottom:18px; border-left:4px solid #2563eb;">
          <div class="card-header"><h4>🎁 전 직원 기본 연차 일괄 세팅 (초기 일괄 부여)</h4></div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="font-size:13px; color:#334155;">전 직원의 총 연차 일수를</span>
            <input type="number" id="bulk-leave-days" value="15" step="0.5" style="width:80px; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-weight:700;" />
            <span style="font-size:13px; color:#334155;">일로</span>
            <label style="font-size:13px; display:flex; align-items:center; gap:4px;">
              <input type="checkbox" id="bulk-reset-used" /> 사용 연차도 0일로 함께 초기화
            </label>
            <button type="button" class="btn-primary" id="btn-bulk-leave">일괄 부여 실행</button>
          </div>
        </div>

        <!-- 직원별 개별 연차 부여 및 조정 -->
        <div class="card">
          <div class="card-header"><h4>👥 임직원별 연차 부여 및 잔여 일수 관리 (${allUsers.length}명)</h4></div>
          <p style="font-size:12.5px; color:#64748b; margin-bottom:12px;">
            직급·근속연수에 따라 직원마다 <strong>총 부여 연차</strong>와 <strong>사용 연차</strong>를 개별 수정한 뒤 우측 <strong>[연차 저장]</strong>을 누르세요.
          </p>
          <table class="list-table">
            <thead>
              <tr>
                <th>성명 / 이메일</th>
                <th>부서 · 직급</th>
                <th>총 부여 연차(일)</th>
                <th>사용 연차(일)</th>
                <th>현재 잔여 연차</th>
                <th>가입 상태</th>
                <th>개별 저장</th>
              </tr>
            </thead>
            <tbody>
              ${allUsers.map(u => {
                const t = Number(u.annualTotal ?? 15);
                const used = Number(u.annualUsed ?? 0);
                const rem = Number((t - used).toFixed(1));
                return `
                  <tr>
                    <td><strong>${u.name}</strong><br/><span style="font-size:11px; color:#64748b;">${u.email || "-"}</span></td>
                    <td>${u.dept} · ${u.position}</td>
                    <td><input type="number" id="total-${u.id}" value="${t}" step="0.5" style="width:70px; padding:6px; border:1px solid #cbd5e1; border-radius:6px;" /></td>
                    <td><input type="number" id="used-${u.id}" value="${used}" step="0.5" style="width:70px; padding:6px; border:1px solid #cbd5e1; border-radius:6px;" /></td>
                    <td><strong style="color:#1d4ed8;">${rem}일</strong></td>
                    <td>${u.approvalStatus === "APPROVED" ? "✅ 승인됨" : "⏳ 대기"}</td>
                    <td>
                      <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="App.saveUserLeave('${u.id}')">연차 저장</button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById("btn-bulk-leave").onclick = async () => {
        const days = document.getElementById("bulk-leave-days").value;
        const resetUsed = document.getElementById("bulk-reset-used").checked;
        if (!confirm(`모든 직원의 총 연차를 ${days}일로 일괄 변경하시겠습니까?`)) return;
        try {
          await StorageDB.bulkUpdateAnnualLeave(days, resetUsed);
          this.showToast(`전 직원 총 연차가 ${days}일로 일괄 부여되었습니다!`);
          this.navigateTo("admin");
        } catch (err) {
          alert(err.message);
        }
      };
      return;
    }

    // 3. 휴가 캘린더
    if (pageKey === "leave-calendar") {
      const approved = (db.leaveRequests || []).filter(r => r.status === "APPROVED");
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>📅 최종 승인된 전사 휴가 캘린더 (연속 가로선 ━━━━ 시각화)</h4></div>
          <div style="display:flex; flex-direction:column; gap:10px; padding:10px 0;">
            ${approved.length === 0 ? `<p style="color:#94a3b8; font-size:13px;">아직 최종 승인된 휴가 일정이 없습니다.</p>` : ""}
            ${approved.map(a => `
              <div style="display:flex; align-items:center; gap:12px; background:#eff6ff; border-left:4px solid #2563eb; padding:10px 14px; border-radius:6px;">
                <strong style="min-width:130px; color:#1e3a8a;">${a.applicantName} (${a.leaveType})</strong>
                <div style="flex:1; display:flex; align-items:center; gap:8px;">
                  <span style="font-size:12px; font-weight:700; color:#2563eb;">${a.startDate}</span>
                  <div style="flex:1; height:6px; background:#2563eb; border-radius:99px;"></div>
                  <span style="font-size:12px; font-weight:700; color:#2563eb;">${a.endDate} (${a.days}일)</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
      return;
    }

    // 4. 재직자 조직도
    if (pageKey === "organization") {
      const approvedUsers = (db.users || []).filter(u => u.approvalStatus !== "PENDING" && u.approvalStatus !== "REJECTED");
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>🏢 사내 재직자 조직도 (${approvedUsers.length}명)</h4></div>
          <table class="list-table">
            <thead><tr><th>부서</th><th>성명</th><th>직급</th><th>이메일</th><th>연락처</th></tr></thead>
            <tbody>
              ${approvedUsers.map(u => `<tr><td><strong>${u.dept}</strong></td><td>${u.name}</td><td>${u.position}</td><td>${u.email || "-"}</td><td>${u.phone || "-"}</td></tr>`).join("")}
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
      APPROVED: "최종 승인 (연차차감)",
      REJECTED: "결재 반려",
      PENDING: "1차 결재 대기",
      IN_PROGRESS: "최종 결재 대기"
    };
    return map[status] || status;
  },

  async handleSequentialApproval(docId, stepNumber, isApprove) {
    const db = StorageDB.getData();
    const doc = (db.leaveRequests || []).find(d => String(d.id) === String(docId));
    if (!doc) return;

    try {
      await StorageDB.processLeaveApproval(doc, stepNumber, isApprove);
      if (!isApprove) {
        this.showToast("결재가 반려 처리되었습니다.");
      } else if (stepNumber === 1) {
        this.showToast("✅ 1차 승인 완료! 최종 결재권자에게 알림이 발송되었습니다.");
      } else {
        this.showToast("🎉 최종 승인 완료! 신청자의 잔여 연차가 자동 차감되었습니다.");
      }
      this.navigateTo("approval");
    } catch (err) {
      alert(err.message);
    }
  },

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

  // 관리자 전용: 직원 개별 연차 저장
  async saveUserLeave(targetUserId) {
    const totalVal = document.getElementById(`total-${targetUserId}`).value;
    const usedVal = document.getElementById(`used-${targetUserId}`).value;
    try {
      await StorageDB.updateSingleUserLeave(targetUserId, totalVal, usedVal);
      this.showToast("✅ 직원의 연차 정보가 저장되었습니다.");
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