/**
 * js/main.js (회원가입 + 로그인 + 게시판/결재 통합 완성본)
 */
const PAGE_TITLES = {
  "dashboard": "대시보드",
  "approval": "전자결재 및 휴가 신청",
  "leave-calendar": "전사 휴가 캘린더",
  "organization": "회사 조직도",
  "notice": "회사 공지사항",
  "board": "사내 게시판",
  "schedule": "회사 일정",
  "programs": "프로그램 설치 안내",
  "archive": "전사 자료실"
};

const App = {
  currentPage: "dashboard",

  init() {
    StorageDB.init();
    this.bindGlobalEvents();
    const sessionUser = Auth.getCurrentUser();
    sessionUser ? this.enterApp(sessionUser) : this.showLoginScreen();
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
      this.showToast(`환영합니다, ${res.user.name}님!`);
      this.enterApp(res.user);
    });

    // 2. 회원가입 제출
    document.getElementById("signup-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const namePos = document.getElementById("signup-name").value.trim();
      const dept = document.getElementById("signup-dept").value;
      const email = document.getElementById("signup-email").value.trim();
      const pw = document.getElementById("signup-pw").value.trim();
      const errEl = document.getElementById("auth-error");

      const res = await Auth.signup(email, pw, namePos, dept);
      if (!res.success) {
        errEl.textContent = res.message;
        errEl.classList.remove("hidden");
        SwitchAuthTab('login');
        return;
      }
      StorageDB.setSessionUser(res.user.id);
      this.showToast("회원가입 및 자동 로그인 완료!");
      this.enterApp(res.user);
    });

    // 3. 메뉴 이동 및 로그아웃
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => this.navigateTo(btn.getAttribute("data-page")));
    });

    document.getElementById("brand-home").addEventListener("click", () => this.navigateTo("dashboard"));

    document.getElementById("btn-logout").addEventListener("click", () => {
      Auth.logout();
      this.showLoginScreen();
    });

    document.getElementById("btn-reset-storage").addEventListener("click", () => {
      if (confirm("공용 클라우드 데이터를 초기 상태로 되돌리시겠습니까?")) {
        StorageDB.resetToSeed();
        this.navigateTo(this.currentPage);
        this.showToast("초기 데이터로 복원되었습니다.");
      }
    });
  },

  showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-layout").classList.add("hidden");
  },

  enterApp(user) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-layout").classList.remove("hidden");
    this.updateHeaderUserInfo(user);
    this.navigateTo("dashboard");
  },

  updateHeaderUserInfo(user) {
    document.getElementById("user-avatar").textContent = user.name.charAt(0);
    document.getElementById("user-name-display").textContent = `${user.name} ${user.position}`;
    document.getElementById("user-dept-display").textContent = `${user.dept} · ${Auth.getRoleLabel(user.role)}`;
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

  renderSubPageContent(container, pageKey, user) {
    const db = StorageDB.getData();

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
          <div class="card-header"><h4>💬 전체 게시글 목록 (${db.boardPosts.length}건)</h4></div>
          <table class="list-table">
            <thead><tr><th>분류</th><th>제목 / 내용</th><th>작성자</th><th>작성일</th><th>관리</th></tr></thead>
            <tbody>
              ${db.boardPosts.map((b, idx) => `
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
          date: new Date().toISOString().slice(0, 10),
          comments: 0
        });
        StorageDB.saveData(db);
        this.showToast("게시글이 클라우드에 등록되었습니다.");
        this.navigateTo("board");
      };
      return;
    }

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
              ${db.notices.map(n => `
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
          date: new Date().toISOString().slice(0, 10),
          views: 1
        });
        StorageDB.saveData(db);
        this.showToast("공지사항이 등록되었습니다.");
        this.navigateTo("notice");
      };
      return;
    }

    if (pageKey === "approval") {
      const ceoUser = db.users.find(u => u.role === "CEO") || { id: "ceo", name: "대표님", position: "대표이사" };
      const middleCandidates = db.users.filter(u => u.id !== user.id && u.role !== "CEO");

      container.innerHTML = `
        <div class="card" style="margin-bottom:18px;">
          <div class="card-header"><h4>✍️ 휴가 신청서 기안 작성 (최종 결재자: ${ceoUser.name} 자동 고정)</h4></div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:8px;">
            <select id="ap-type" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
              <option value="연차">연차</option>
              <option value="오전반차">오전반차 (0.5일)</option>
              <option value="오후반차">오후반차 (0.5일)</option>
              <option value="기타휴가">기타휴가</option>
            </select>
            <input type="date" id="ap-start" value="2026-11-23" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <input type="date" id="ap-end" value="2026-11-25" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <select id="ap-mid" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
              <option value="">1차 검토자 선택 (없으면 대표님 직행)</option>
              ${middleCandidates.map(m => `<option value="${m.id}">1차 결재: ${m.name} ${m.position}</option>`).join("")}
            </select>
          </div>
          <div style="display:flex; gap:8px;">
            <input type="text" id="ap-reason" placeholder="휴가 사유를 입력하세요" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button class="btn-primary" id="btn-submit-ap">기안 상신하기</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>📝 전자결재 문서 목록</h4></div>
          <table class="list-table">
            <thead><tr><th>문서번호</th><th>신청자</th><th>종류/기간</th><th>결재선 진행상황</th><th>상태</th><th>결재 처리</th></tr></thead>
            <tbody>
              ${db.leaveRequests.map((doc, idx) => {
                const curStep = doc.approvalLine[doc.currentStepIndex];
                const isMyTurn = (doc.status === "PENDING" || doc.status === "IN_PROGRESS") && curStep && curStep.userId === user.id;
                return `
                  <tr>
                    <td><strong>${doc.id}</strong></td>
                    <td>${doc.applicantName} (${doc.dept})</td>
                    <td>${doc.leaveType}<br/><span style="font-size:12px; color:#64748b;">${doc.startDate} ~ ${doc.endDate} (${doc.days}일)</span></td>
                    <td>${doc.approvalLine.map(s => `${s.name}(${s.status === 'APPROVED' ? '✅승인' : s.status === 'REJECTED' ? '❌반려' : '⏳대기'})`).join(" → ")}</td>
                    <td><span class="status-badge status-${doc.status}">${DashboardModule.getStatusLabel(doc.status)}</span></td>
                    <td>
                      ${isMyTurn ? `
                        <button class="btn-primary" style="padding:4px 8px; font-size:12px;" onclick="App.actApproval(${idx}, true)">승인</button>
                        <button class="btn-logout" style="padding:4px 8px; font-size:12px; color:#dc2626;" onclick="App.actApproval(${idx}, false)">반려</button>
                      ` : `<span style="font-size:12px; color:#94a3b8;">-</span>`}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById("btn-submit-ap").onclick = () => {
        const leaveType = document.getElementById("ap-type").value;
        const startDate = document.getElementById("ap-start").value;
        const endDate = document.getElementById("ap-end").value;
        const midId = document.getElementById("ap-mid").value;
        const reason = document.getElementById("ap-reason").value.trim();

        if (!startDate || !endDate || !reason) return alert("날짜와 휴가 사유를 모두 입력해 주세요.");
        if (endDate < startDate) return alert("종료일이 시작일보다 빠를 수 없습니다.");

        const diffDays = Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
        const days = leaveType.includes("반차") ? 0.5 : diffDays;

        const approvalLine = [];
        if (midId) {
          const midUser = db.users.find(u => u.id === midId);
          approvalLine.push({ step: 1, userId: midUser.id, name: midUser.name, position: midUser.position, status: "WAITING" });
        }
        approvalLine.push({ step: approvalLine.length + 1, userId: ceoUser.id, name: ceoUser.name, position: ceoUser.position, status: "WAITING" });

        db.leaveRequests.unshift({
          id: "DOC-2026-" + (100 + db.leaveRequests.length + 1),
          applicantId: user.id,
          applicantName: user.name,
          dept: user.dept,
          position: user.position,
          leaveType,
          startDate,
          endDate,
          days,
          reason,
          status: "PENDING",
          currentStepIndex: 0,
          approvalLine
        });
        StorageDB.saveData(db);
        this.showToast("휴가 신청서가 상신되었습니다.");
        this.navigateTo("approval");
      };
      return;
    }

    if (pageKey === "leave-calendar") {
      const approved = db.leaveRequests.filter(r => r.status === "APPROVED");
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>📅 최종 승인된 휴가 캘린더 (연속 가로 막대 ━━━━ 시각화)</h4></div>
          <div style="display:flex; flex-direction:column; gap:10px; padding:10px 0;">
            ${approved.map(a => `
              <div style="display:flex; align-items:center; gap:12px; background:#eff6ff; border-left:4px solid #2563eb; padding:10px 14px; border-radius:6px;">
                <strong style="min-width:110px; color:#1e3a8a;">${a.applicantName} (${a.leaveType})</strong>
                <div style="flex:1; display:flex; align-items:center; gap:8px;">
                  <span style="font-size:12px; font-weight:700; color:#2563eb;">${a.startDate}</span>
                  <div style="flex:1; height:6px; background:#2563eb; border-radius:99px;"></div>
                  <span style="font-size:12px; font-weight:700; color:#2563eb;">${a.endDate} (${a.days}일간 연속)</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
      return;
    }

    if (pageKey === "organization") {
      container.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>🏢 사내 조직도 (가입된 임직원 목록)</h4></div>
          <table class="list-table">
            <thead><tr><th>부서</th><th>이름</th><th>직급</th><th>이메일</th></tr></thead>
            <tbody>
              ${db.users.map(u => `<tr><td><strong>${u.dept}</strong></td><td>${u.name}</td><td>${u.position}</td><td>${u.email || "-"}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="card"><h4>[${PAGE_TITLES[pageKey]}] 페이지입니다.</h4></div>`;
  },

  deleteBoard(idx) {
    const db = StorageDB.getData();
    db.boardPosts.splice(idx, 1);
    StorageDB.saveData(db);
    this.showToast("게시글이 삭제되었습니다.");
    this.navigateTo("board");
  },

  actApproval(docIdx, isApprove) {
    const db = StorageDB.getData();
    const doc = db.leaveRequests[docIdx];
    const step = doc.approvalLine[doc.currentStepIndex];
    step.status = isApprove ? "APPROVED" : "REJECTED";

    if (!isApprove) {
      doc.status = "REJECTED";
      this.showToast("반려 처리되었습니다.");
    } else if (doc.currentStepIndex + 1 >= doc.approvalLine.length) {
      doc.status = "APPROVED";
      this.showToast("🎉 대표님 최종 승인이 완료되어 휴가 캘린더에 반영되었습니다!");
    } else {
      doc.currentStepIndex += 1;
      doc.status = "IN_PROGRESS";
      this.showToast("1차 승인 완료! 다음 결재자에게 전달되었습니다.");
    }
    StorageDB.saveData(db);
    this.navigateTo("approval");
  },

  showToast(msg) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());