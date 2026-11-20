/**
 * js/main.js (진짜 월간 그리드 달력 & 다중 휴가 스태킹 + 휴가 수정/취소/연차복구 통합본)
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

const KR_HOLIDAYS_MAP = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일",
  "2026-05-01": "근로자의 날", "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일",
  "2026-06-03": "지방선거", "2026-06-06": "현충일",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일", "2026-10-09": "한글날",
  "2026-12-25": "성탄절",

  "2027-01-01": "신정",
  "2027-02-06": "설날 연휴", "2027-02-07": "설날", "2027-02-08": "설날 연휴", "2027-02-09": "대체공휴일",
  "2027-03-01": "삼일절", "2027-05-01": "근로자의 날", "2027-05-05": "어린이날", "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일", "2027-08-15": "광복절", "2027-08-16": "대체공휴일",
  "2027-09-14": "추석 연휴", "2027-09-15": "추석", "2027-09-16": "추석 연휴",
  "2027-10-03": "개천절", "2027-10-04": "대체공휴일", "2027-10-09": "한글날", "2027-10-11": "대체공휴일",
  "2027-12-25": "성탄절",

  "2028-01-01": "신정",
  "2028-01-26": "설날 연휴", "2028-01-27": "설날", "2028-01-28": "설날 연휴",
  "2028-03-01": "삼일절", "2028-04-12": "총선",
  "2028-05-01": "근로자의 날", "2028-05-02": "부처님오신날", "2028-05-05": "어린이날",
  "2028-06-06": "현충일", "2028-08-15": "광복절",
  "2028-10-02": "추석 연휴", "2028-10-03": "추석/개천절", "2028-10-04": "추석 연휴", "2028-10-05": "대체공휴일", "2028-10-09": "한글날",
  "2028-12-25": "성탄절"
};

const CUSTOM_HOLIDAY_STORAGE_KEY = "gw_custom_company_holidays";
const BAR_COLORS = ["#2563eb", "#059669", "#7c3aed", "#db2777", "#d97706", "#0891b2", "#4f46e5"];

const App = {
  currentPage: "dashboard",
  selectedApprover1: null,
  selectedApprover2: null,
  editingLeaveDocId: null, // 휴가 수정 모드일 때 대상 문서 ID 저장
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  loadedYears: new Set(),

 async init() {
    // 이벤트 바인딩을 최우선으로 수행 (이후 단계에서 오류가 나도 로그인 폼이 새로고침되지 않도록)
    this.bindGlobalEvents();

    try {
      StorageDB.init();
    } catch (e) {
      console.error("StorageDB 초기화 실패:", e);
    }
    const curYear = new Date().getFullYear();
    this.fetchPublicHolidaysFromAPI(curYear);
    this.fetchPublicHolidaysFromAPI(curYear + 1);

    // 브라우저 뒤로가기 / 앞으로가기 버튼 클릭 시 버벅임 없이 해당 메뉴로 즉시 전환
    window.addEventListener("popstate", (e) => {
      const user = Auth.getCurrentUser();
      if (!user) return this.showLoginScreen();
      const targetPage = (e.state && e.state.page) ? e.state.page : (location.hash.replace("#", "") || "dashboard");
      this.navigateTo(targetPage, false);
    });

    // ✅ 저장된 아이디(이메일) 자동 입력
    const savedEmail = Auth.getSavedEmail();
    const emailInput = document.getElementById("login-email");
    const saveEmailChk = document.getElementById("chk-save-email");
    if (savedEmail && emailInput) {
      emailInput.value = savedEmail;
      if (saveEmailChk) saveEmailChk.checked = true;
    }
    // ✅ 로그인 유지 사용 시 만료된 토큰 자동 갱신
    await Auth.refreshSessionIfNeeded();

    // 로그인 정보는 sessionStorage에만 저장되므로 탭/브라우저 종료 시 자동 로그아웃됨.
    // 해시(#)가 없어도(모바일 인앱 브라우저가 해시를 제거하는 경우 등) 세션이 살아있으면 로그인 유지.
    const sessionUser = Auth.getCurrentUser();
    if (sessionUser && Auth.getToken()) {
      const startPage = location.hash.replace("#", "") || "dashboard";
      this.enterApp(sessionUser, startPage);
    } else {
      this.showLoginScreen();
    }
  },

  async fetchPublicHolidaysFromAPI(year) {
    if (this.loadedYears.has(year)) return;
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(item => {
          if (!KR_HOLIDAYS_MAP[item.date]) {
            KR_HOLIDAYS_MAP[item.date] = item.localName || item.name;
          }
        });
        this.loadedYears.add(year);
      }
    } catch (e) {}
  },

  getCustomHolidays() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_HOLIDAY_STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  },

  getHolidayName(dateStr) {
    const customMap = this.getCustomHolidays();
    return customMap[dateStr] || KR_HOLIDAYS_MAP[dateStr] || null;
  },

  calculateWorkingDays(startStr, endStr) {
    if (!startStr || !endStr || endStr < startStr) {
      return { workingDays: 0, totalSpanDays: 0, weekendCount: 0, holidayNames: [] };
    }

    const [sy, sm, sd] = startStr.split("-").map(Number);
    const [ey, em, ed] = endStr.split("-").map(Number);
    this.fetchPublicHolidaysFromAPI(sy);
    if (ey !== sy) this.fetchPublicHolidaysFromAPI(ey);

    const cur = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);

    let workingDays = 0;
    let totalSpanDays = 0;
    let weekendCount = 0;
    const holidayNames = [];

    while (cur <= last) {
      totalSpanDays++;
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const dayOfWeek = cur.getDay();
      const holName = this.getHolidayName(dateStr);

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendCount++;
      } else if (holName) {
        holidayNames.push(`${m}/${d}(${holName})`);
      } else {
        workingDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    return { workingDays, totalSpanDays, weekendCount, holidayNames };
  },

  renderQuickAccountButtons() {},
  populateHeaderSwitcher() {},

  bindGlobalEvents() {
    // 1. 로그인 (모바일 지연 방지 및 즉시 대시보드 진입 적용)
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const pw = document.getElementById("login-pw").value.trim();
      const errEl = document.getElementById("auth-error");
      const submitBtn = e.target.querySelector("button[type='submit']");

      try {
        if (submitBtn) submitBtn.textContent = "로그인 중...";
        const saveEmail = document.getElementById("chk-save-email")?.checked || false;
        const keepLogin = document.getElementById("chk-keep-login")?.checked || false;
        Auth.setSavedEmail(email, saveEmail);
        const res = await Auth.login(email, pw, keepLogin);
        if (submitBtn) submitBtn.textContent = "로그인하기";

        if (!res.success) {
          errEl.textContent = res.message;
          errEl.classList.remove("hidden");
          return;
        }
        errEl.classList.add("hidden");
        // 모바일에서 지연 없이 즉시 메인 화면으로 먼저 진입!
        this.enterApp(res.user, "dashboard");
        this.showToast(`환영합니다, ${res.user.name} ${res.user.position}님!`);
        // 화면 진입 후 백그라운드에서 데이터 동기화
        await StorageDB.syncFromCloud();
        this.navigateTo("dashboard", false);
      } catch (err) {
        if (submitBtn) submitBtn.textContent = "로그인하기";
        errEl.textContent = "로그인 처리 중 오류가 발생했습니다: " + err.message;
        errEl.classList.remove("hidden");
      }
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
      this.enterApp(res.user, "dashboard");
    });

    // 3. 사이드바 메뉴 및 좌측 상단 GW 로고 클릭
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        this.editingLeaveDocId = null;
        this.navigateTo(btn.getAttribute("data-page"));
      });
    });

    document.getElementById("brand-home").addEventListener("click", () => {
      this.editingLeaveDocId = null;
      this.navigateTo("dashboard");
    });

    // 4. 로그아웃 버튼 클릭 시 주소창 해시(#) 깨끗이 제거 후 로그인 화면 복귀
    document.getElementById("btn-logout").addEventListener("click", () => {
      Auth.logout();
      history.replaceState(null, "", location.pathname);
      this.showLoginScreen();
    });

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

    // 모바일 슬라이드 메뉴 (햄버거 / 배경 터치 / 메뉴 선택 / ESC / 화면 확대 시 자동 닫힘)
    const sidebarEl = document.querySelector(".sidebar");
    const backdropEl = document.getElementById("sidebar-backdrop");
    const menuBtn = document.getElementById("btn-menu-toggle");
    const setMenu = (open) => {
      if (sidebarEl) sidebarEl.classList.toggle("open", open);
      if (backdropEl) backdropEl.classList.toggle("show", open);
      document.body.classList.toggle("menu-open", open);
    };
    if (menuBtn) menuBtn.addEventListener("click", () => setMenu(!(sidebarEl && sidebarEl.classList.contains("open"))));
    if (backdropEl) backdropEl.addEventListener("click", () => setMenu(false));
    if (sidebarEl) sidebarEl.addEventListener("click", (e) => {
      if (e.target.closest(".nav-item, .sidebar-brand")) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      this.closeImageViewer();
    });
    window.addEventListener("resize", () => { if (window.innerWidth > 1024) setMenu(false); });

    // 표(list-table)를 모바일 카드로 보여주기 위해 셀에 라벨을 자동 부여 (화면 갱신 때마다 실행)
    const pageEl = document.getElementById("page-content");
    if (pageEl && typeof MutationObserver !== "undefined") {
      new MutationObserver(() => this.enhanceTables(pageEl)).observe(pageEl, { childList: true, subtree: true });
      this.enhanceTables(pageEl);
    }
  },

  // 대시보드 피드 표(feed-table)를 제외한 모든 표에 data-label 부여 + 셀 내용 래핑 (변경이 없으면 아무 작업도 하지 않음)
  // + 배지가 들어가는 열(구분/분류/상태)은 헤더·셀을 모두 가운데 정렬(col-badge)로 표시
  enhanceTables(root) {
    const TAG_HEADS = ["구분", "분류"];
    const STATUS_HEADS = ["상태", "현재 상태"];
    root.querySelectorAll("table.list-table:not(.feed-table)").forEach(table => {
      table.classList.add("stack-table");
      const heads = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim());
      const colClasses = heads.map(h => TAG_HEADS.includes(h) ? ["col-badge", "col-tag"] : STATUS_HEADS.includes(h) ? ["col-badge"] : []);
      table.querySelectorAll("thead th").forEach((th, i) => {
        if (colClasses[i] && colClasses[i].length) th.classList.add(...colClasses[i]);
      });
      table.querySelectorAll("tbody tr").forEach(tr => {
        let col = 0;
        Array.from(tr.children).forEach(td => {
          const span = Number(td.getAttribute("colspan") || 1);
          if (span > 1) {
            td.classList.add("td-wide");
          } else {
            if (heads[col] && !td.hasAttribute("data-label")) td.setAttribute("data-label", heads[col]);
            if (colClasses[col] && colClasses[col].length) td.classList.add(...colClasses[col]);
            const first = td.firstElementChild;
            if (!(td.childNodes.length === 1 && first && first.classList.contains("td-val"))) {
              const wrap = document.createElement("div");
              wrap.className = "td-val";
              while (td.firstChild) wrap.appendChild(td.firstChild);
              td.appendChild(wrap);
            }
          }
          col += span;
        });
      });
    });
  },

  showLoginScreen() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-layout").classList.add("hidden");
  },

  enterApp(user, initialPage = "dashboard") {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-layout").classList.remove("hidden");
    this.updateHeaderUserInfo(user);
    const db = StorageDB.getData();
    this.updateNotificationBadge(db.notifications || []);
    this.navigateTo(initialPage, true);
  },

  updateHeaderUserInfo(user) {
    if (!user) return;
    const total = Number(user.annualTotal ?? 15);
    const used = Number(user.annualUsed ?? 0);
    const remain = Number((total - used).toFixed(1));

    document.getElementById("user-avatar").textContent = (user.name || "사").charAt(0);
    document.getElementById("user-name-display").textContent = `${user.name} ${user.position}`;
    document.getElementById("user-dept-display").textContent = `${user.dept} · ${Auth.getRoleLabel(user.role)}`;

    // 관리자(ADMIN)가 아니면 '관리자 전용' 메뉴 그룹을 아예 숨김
    const adminGroup = document.getElementById("nav-group-admin");
    if (adminGroup) adminGroup.classList.toggle("hidden", !Auth.isAdmin(user));

    // 모바일 슬라이드 메뉴 상단 사용자 카드 (헤더에서 숨긴 이름/잔여 연차를 여기서 표시)
    const drawerUser = document.getElementById("drawer-user");
    if (drawerUser) {
      drawerUser.innerHTML = `
        <div class="du-name">${user.name} ${user.position}</div>
        <div class="du-sub">${user.dept} · ${Auth.getRoleLabel(user.role)}</div>
        <div class="du-leave">🌴 잔여 연차 <strong>${remain}일</strong> (총 ${total}일)</div>
      `;
    }

    const leaveBadge = document.getElementById("header-leave-badge");
    if (leaveBadge) {
      leaveBadge.innerHTML = `🌴 잔여 연차: <strong>${remain}일</strong> <span style="font-weight:400; color:#64748b;">(총 ${total}일)</span>`;
    }
  },

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
      <div class="notif-item ${n.is_read ? "" : "unread"}" style="cursor:pointer;" onclick="App.handleNotificationClick('${n.id}')">
        <div>${n.message}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">${(n.created_at || "").slice(0, 16).replace("T", " ")}</div>
      </div>
    `).join("");
  },

  navigateTo(pageKey, pushHistory = true) {
    const user = Auth.getCurrentUser();
    if (!user) return this.showLoginScreen();

    const validPage = PAGE_TITLES[pageKey] ? pageKey : "dashboard";
    this.currentPage = validPage;
    this.updateHeaderUserInfo(user);

    // 브라우저 주소창 해시(#dashboard 등) 기록 -> 뒤로가기 완벽 작동!
    if (pushHistory && location.hash !== `#${validPage}`) {
      history.pushState({ page: validPage }, "", `#${validPage}`);
    }

    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-page") === validPage);
    });
    document.getElementById("current-page-title").textContent = PAGE_TITLES[validPage] || "대시보드";
    const container = document.getElementById("page-content");

    if (validPage === "dashboard") {
      DashboardModule.render(container, user);
      return;
    }
    this.renderSubPageContent(container, validPage, user);
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

  // [추가] 내 휴가 신청서 수정 모드 진입 (상단 폼에 기존 데이터 자동 채움)
  startEditLeaveRequest(docId) {
    const db = StorageDB.getData();
    const doc = (db.leaveRequests || []).find(d => String(d.id) === String(docId));
    if (!doc) return;

    this.editingLeaveDocId = doc.id;
    this.selectedApprover1 = (db.users || []).find(u => u.id === doc.approver1Id) || { id: doc.approver1Id, name: doc.approver1Name, position: "" };
    this.selectedApprover2 = (db.users || []).find(u => u.id === doc.approver2Id) || { id: doc.approver2Id, name: doc.approver2Name, position: "" };

    this.navigateTo("approval");
    setTimeout(() => {
      document.getElementById("ap-type").value = doc.leaveType;
      document.getElementById("ap-start").value = doc.startDate;
      document.getElementById("ap-end").value = doc.endDate;
      document.getElementById("ap-reason").value = doc.reason;
      document.getElementById("ap-type").dispatchEvent(new Event("change"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  },

  cancelEditMode() {
    this.editingLeaveDocId = null;
    this.navigateTo("approval");
  },

  // [추가] 휴가 취소 실행 (결재 전 삭제 / 최종 승인 후 취소 및 연차 복구)
  async handleCancelLeaveRequest(docId) {
    const db = StorageDB.getData();
    const doc = (db.leaveRequests || []).find(d => String(d.id) === String(docId));
    if (!doc) return;

    const confirmMsg = doc.status === "APPROVED"
      ? `[승인된 휴가 취소]\n이미 최종 승인된 ${doc.leaveType}(${doc.days}일) 일정입니다.\n취소하시면 차감되었던 연차(${doc.days}일)가 자동 환급(복구)되며 휴가 캘린더에서 제거됩니다. 취소하시겠습니까?`
      : `신청하신 ${doc.leaveType}(${doc.startDate}~${doc.endDate}) 상신을 취소(삭제)하시겠습니까?`;

    if (!confirm(confirmMsg)) return;

    try {
      await StorageDB.cancelLeaveRequest(doc);
      this.showToast(doc.status === "APPROVED" ? "🔄 휴가가 취소되었으며 차감된 연차가 정상 복구되었습니다!" : "🗑️ 휴가 신청이 취소(삭제)되었습니다.");
      this.navigateTo(this.currentPage);
    } catch (err) {
      alert(err.message);
    }
  },

  // 달력 월 이동
  changeCalendarMonth(delta) {
    this.calMonth += delta;
    if (this.calMonth > 12) {
      this.calMonth = 1;
      this.calYear++;
    } else if (this.calMonth < 1) {
      this.calMonth = 12;
      this.calYear--;
    }
    this.fetchPublicHolidaysFromAPI(this.calYear);
    this.navigateTo("leave-calendar");
  },

  goCalendarToday() {
    this.calYear = new Date().getFullYear();
    this.calMonth = new Date().getMonth() + 1;
    this.navigateTo("leave-calendar");
  },

  // [핵심] 월간 그리드 달력 + 겹치는 휴가자 자동 스태킹(Lane 배정) 렌더링
  renderMonthlyGridCalendar(approvedLeaves) {
    const year = this.calYear;
    const month = this.calMonth;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // 달력 첫 칸(일요일)과 마지막 칸(토요일) 계산
    const startGridDate = new Date(firstDay);
    startGridDate.setDate(firstDay.getDate() - firstDay.getDay());

    const endGridDate = new Date(lastDay);
    endGridDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

    const fmt = (d) => {
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };

    const todayStr = fmt(new Date());

    // 주(Week) 단위로 7일씩 쪼개기
    const weeks = [];
    const cur = new Date(startGridDate);
    while (cur <= endGridDate) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    // 신청자마다 고유 색상 배정
    const getColorForUser = (name) => {
      let hash = 0;
      for (let i = 0; i < (name || "").length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return BAR_COLORS[Math.abs(hash) % BAR_COLORS.length];
    };

    // 각 주(Week)마다 걸치는 휴가들을 찾아 겹치지 않게 층(Lane) 자동 배치
    const weekRowsHtml = weeks.map(week => {
      const weekStartStr = fmt(week[0]);
      const weekEndStr = fmt(week[6]);

      // 이번 주와 하루라도 겹치는 승인된 휴가 필터링
      const overlapping = approvedLeaves.filter(lv => lv.endDate >= weekStartStr && lv.startDate <= weekEndStr);

      // 시작일이 빠른 순, 기간이 긴 순으로 정렬하여 스태킹 최적화
      overlapping.sort((a, b) => {
        if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
        return b.days - a.days;
      });

      // 층(Lane) 점유 상태 배열: lanes[laneIndex] = 마지막으로 채워진 요일 인덱스(0~6)
      const lanes = [];
      const segments = [];

      overlapping.forEach(lv => {
        const segStartStr = lv.startDate < weekStartStr ? weekStartStr : lv.startDate;
        const segEndStr = lv.endDate > weekEndStr ? weekEndStr : lv.endDate;

        const startCol = week.findIndex(d => fmt(d) === segStartStr);
        const endCol = week.findIndex(d => fmt(d) === segEndStr);
        if (startCol === -1 || endCol === -1) return;

        // 비어 있는 가장 위쪽 층(Lane) 찾기
        let assignedLane = -1;
        for (let l = 0; l < lanes.length; l++) {
          if (lanes[l] < startCol) {
            assignedLane = l;
            lanes[l] = endCol;
            break;
          }
        }
        if (assignedLane === -1) {
          assignedLane = lanes.length;
          lanes.push(endCol);
        }

        segments.push({
          doc: lv,
          startCol,
          span: endCol - startCol + 1,
          lane: assignedLane,
          isContinuedLeft: lv.startDate < weekStartStr,
          isContinuedRight: lv.endDate > weekEndStr
        });
      });

      // 휴가자가 많이 겹칠수록 해당 주의 달력 칸 높이를 자동으로 늘려줌 (기본 96px, 겹치면 26px씩 자동 확장)
      const rowHeight = Math.max(96, 36 + lanes.length * 26);

      const dayCellsHtml = week.map((d, idx) => {
        const dStr = fmt(d);
        const isCurrentMonth = (d.getMonth() + 1) === month;
        const holName = this.getHolidayName(dStr);
        const isSun = idx === 0;
        const isSat = idx === 6;
        const numColor = (isSun || holName) ? "#dc2626" : isSat ? "#2563eb" : "#1e293b";
        const todayBadge = dStr === todayStr ? `<span class="cal-today-badge" style="background:#2563eb; color:#fff; padding:1px 5px; border-radius:4px; font-size:10px;">오늘</span>` : "";

        return `
          <div class="cal-day-cell ${isCurrentMonth ? '' : 'other-month'} ${dStr === todayStr ? 'is-today' : ''}">
            <div class="cal-day-num" style="color:${isCurrentMonth ? numColor : '#cbd5e1'};">
              <span class="cal-day-no">${d.getDate()} ${todayBadge}</span>
              ${holName ? `<span class="cal-hol-label" title="${holName}">${holName}</span>` : ""}
            </div>
          </div>
        `;
      }).join("");

      const barsHtml = segments.map(seg => {
        const leftPct = (seg.startCol * 100 / 7).toFixed(4);
        const widthPct = (seg.span * 100 / 7).toFixed(4);
        const topPx = 30 + seg.lane * 25;
        const bgColor = getColorForUser(seg.doc.applicantName);
        const radiusLeft = seg.isContinuedLeft ? "0" : "5px";
        const radiusRight = seg.isContinuedRight ? "0" : "5px";

        return `
          <div class="cal-event-bar"
               title="${seg.doc.applicantName} ${seg.doc.position} (${seg.doc.dept}) | ${seg.doc.leaveType} (${seg.doc.startDate} ~ ${seg.doc.endDate}, 실차감 ${seg.doc.days}일)"
               style="--lane:${seg.lane}; left: calc(${leftPct}% + 3px); width: calc(${widthPct}% - 6px); top: ${topPx}px; background: ${bgColor}; border-radius: ${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft};">
            <span class="bar-name">${seg.doc.applicantName}</span><span class="bar-extra"> ${seg.doc.position} (${seg.doc.leaveType})</span>
          </div>
        `;
      }).join("");

      return `
        <div class="cal-week-row" style="--lanes:${lanes.length}; min-height: ${rowHeight}px;">
          <div class="cal-day-cells">${dayCellsHtml}</div>
          <div class="cal-events-layer">${barsHtml}</div>
        </div>
      `;
    }).join("");

    // 모바일 전용: 달력 대신 '이달의 휴일 + 휴가자 목록'으로 보여주는 아젠다 뷰 (CSS로 PC/모바일 전환)
    const dowNames = ["일", "월", "화", "수", "목", "금", "토"];
    const fmtMD = (s) => {
      const [yy, mm, dd] = s.split("-").map(Number);
      return `${mm}/${dd}(${dowNames[new Date(yy, mm - 1, dd).getDay()]})`;
    };
    const monthStartStr = fmt(firstDay);
    const monthEndStr = fmt(lastDay);
    const monthLeaves = approvedLeaves
      .filter(lv => lv.endDate >= monthStartStr && lv.startDate <= monthEndStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.days - a.days);
    const monthHolidays = [];
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const ds = fmt(d);
      const hn = this.getHolidayName(ds);
      if (hn) monthHolidays.push({ ds, name: hn });
    }
    const agendaHtml = `
      <div class="cal-agenda">
        ${monthHolidays.length ? `
          <div class="cal-agenda-hol">
            ${monthHolidays.map(h => `<span class="cal-hol-chip">${fmtMD(h.ds)} ${h.name}</span>`).join("")}
          </div>` : ""}
        <div class="cal-agenda-title">🏖️ ${month}월 휴가자 (${monthLeaves.length}건)</div>
        ${monthLeaves.length === 0
          ? `<div class="cal-agenda-empty">이번 달 승인된 휴가가 없습니다.</div>`
          : monthLeaves.map(lv => {
              const onLeaveToday = lv.startDate <= todayStr && todayStr <= lv.endDate;
              const period = lv.startDate === lv.endDate ? fmtMD(lv.startDate) : `${fmtMD(lv.startDate)} ~ ${fmtMD(lv.endDate)}`;
              return `
                <div class="cal-agenda-item" style="border-left-color:${getColorForUser(lv.applicantName)};">
                  <div class="cal-agenda-top">
                    <strong>${lv.applicantName} ${lv.position || ""}</strong>
                    <span class="cal-agenda-dept">${lv.dept || ""}</span>
                    ${onLeaveToday ? `<span class="status-badge status-APPROVED">오늘 휴가중</span>` : ""}
                  </div>
                  <div class="cal-agenda-sub">${lv.leaveType} · ${period} · 실차감 ${lv.days}일</div>
                </div>`;
            }).join("")}
      </div>
    `;

    return `
      <div class="cal-toolbar">
        <div class="cal-nav-group">
          <button type="button" class="btn-logout" onclick="App.changeCalendarMonth(-1)">◀ 이전 달</button>
          <div class="cal-month-title">${year}년 ${String(month).padStart(2, "0")}월</div>
          <button type="button" class="btn-logout" onclick="App.changeCalendarMonth(1)">다음 달 ▶</button>
          <button type="button" class="btn-logout" style="font-size:12px;" onclick="App.goCalendarToday()">오늘</button>
        </div>
        <div class="cal-tip" style="font-size:12.5px; color:#64748b;">
          💡 같은 날짜에 여러 휴가자가 겹치면 <strong>달력 칸 높이가 자동 조절되며 줄이 위아래로 나란히 배치</strong>됩니다.
        </div>
      </div>

      <div class="cal-grid-wrap">
        <div class="cal-grid-header">
          <div style="color:#dc2626;">일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div style="color:#2563eb;">토</div>
        </div>
        <div>${weekRowsHtml}</div>
      </div>
      ${agendaHtml}
    `;
  },

  renderSubPageContent(container, pageKey, user) {
    const db = StorageDB.getData();
    const myProfile = (db.users || []).find(u => u.id === user.id) || user;
    const totalLeave = Number(myProfile.annualTotal ?? 15);
    const usedLeave = Number(myProfile.annualUsed ?? 0);
    const remainLeave = Number((totalLeave - usedLeave).toFixed(1));

    // 1. 전자결재 및 휴가 신청 (휴가 수정 및 취소/연차복구 기능 포함)
    if (pageKey === "approval") {
      const ap1Text = this.selectedApprover1 ? `${this.selectedApprover1.name} ${this.selectedApprover1.position || ""}` : "미지정";
      const ap2Text = this.selectedApprover2 ? `${this.selectedApprover2.name} ${this.selectedApprover2.position || ""}` : "미지정";
      const todayStr = new Date().toISOString().slice(0, 10);
      const isEditing = Boolean(this.editingLeaveDocId);

      container.innerHTML = `
        <div class="card" style="margin-bottom:18px; background:linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); border:1px solid #bfdbfe;">
          <div class="summary-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="color:#1e3a8a; margin:0;">🌴 ${user.name} ${user.position}님의 연차 현황 및 실시간 차감 계산</h4>
            <span style="font-size:12px; color:#1d4ed8; font-weight:600;">✔ 주말(토·일) 및 법정공휴일·대체공휴일 자동 제외</span>
          </div>
          <div class="leave-summary-grid" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; text-align:center;">
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
              <strong id="calc-preview-text" style="font-size:18px; color:#047857;">계산 중...</strong>
              <div id="calc-exclude-detail" style="font-size:11px; color:#64748b; margin-top:3px;"></div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:18px; ${isEditing ? 'border:2px solid #f59e0b;' : ''}">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h4>${isEditing ? "✏️ 휴가 신청서 내용 수정 모드" : "✍️ 휴가 신청서 작성"}</h4>
            <button type="button" class="btn-primary" id="btn-open-approver-popup" style="background:#0f172a;">
              👥 재직자 목록에서 결재권자 2명 선택
            </button>
          </div>

          <div class="approver-line" style="background:#f8fafc; padding:12px 14px; border-radius:8px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
            <div style="font-size:13px; font-weight:600; color:#334155;">지정된 결재선 (1차 ➔ 최종):</div>
            <div id="selected-approvers-display" style="font-size:13px;">
              ${this.selectedApprover1 && this.selectedApprover2
                ? `<span class="status-badge status-IN_PROGRESS">1차: ${ap1Text}</span> ➔ <span class="status-badge status-APPROVED">최종: ${ap2Text}</span>`
                : `<span style="color:#ef4444; font-weight:600;">우측 상단 [결재권자 2명 선택] 버튼을 눌러 상급자를 지정하세요</span>`}
            </div>
          </div>

          <div class="form-grid-3" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:8px;">
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
          <div class="form-row" style="display:flex; gap:8px; margin-top:10px;">
            <input type="text" id="ap-reason" placeholder="휴가 사유를 입력하세요 (본인과 결재자에게만 공개됩니다)" style="flex:1; padding:9px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button class="btn-primary" id="btn-submit-ap" style="${isEditing ? 'background:#d97706;' : ''}">
              ${isEditing ? "수정 완료 및 재상신" : "휴가 상신하기"}
            </button>
            ${isEditing ? `<button type="button" class="btn-logout" onclick="App.cancelEditMode()">수정 취소</button>` : ""}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>📝 결재 문서 목록 (본인 신청 건 수정·취소 및 결재 처리)</h4></div>
          <table class="list-table">
            <thead><tr><th>신청자</th><th>휴가종류 / 실차감일수</th><th>1차 결재자</th><th>최종 결재권자</th><th>현재 상태</th><th>결재 / 수정·취소</th></tr></thead>
            <tbody>
              ${(db.leaveRequests || []).length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">조회된 휴가 신청 내역이 없습니다.</td></tr>` : ""}
              ${(db.leaveRequests || []).map(doc => {
                const isTurnStep1 = (doc.status === "PENDING_1" || doc.status === "PENDING") && doc.approver1Id === user.id;
                const isTurnStep2 = (doc.status === "PENDING_2" || doc.status === "IN_PROGRESS") && doc.approver2Id === user.id;
                const isMyDoc = doc.applicantId === user.id;
                const canEdit = isMyDoc && (doc.status === "PENDING_1" || doc.status === "PENDING");
                const canCancel = isMyDoc && doc.status !== "CANCELED";

                return `
                  <tr>
                    <td><strong>${doc.applicantName}</strong><br/><span style="font-size:12px; color:#64748b;">${doc.dept} · ${doc.position}</span></td>
                    <td><strong>${doc.leaveType}</strong> (${doc.days}일 차감)<br/><span style="font-size:12px; color:#64748b;">${doc.startDate} ~ ${doc.endDate}</span></td>
                    <td>${doc.approver1Name || "-"}<br/><span style="font-size:11px;">${doc.approver1Status === "APPROVED" ? "✅ 1차승인" : doc.approver1Status === "REJECTED" ? "❌ 반려" : "⏳ 대기"}</span></td>
                    <td>${doc.approver2Name || "-"}<br/><span style="font-size:11px;">${doc.approver2Status === "APPROVED" ? "✅ 최종승인" : doc.approver2Status === "REJECTED" ? "❌ 반려" : "⏳ 대기"}</span></td>
                    <td><span class="status-badge status-${doc.status}">${this.getLeaveStatusLabel(doc.status)}</span></td>
                    <td>
                      <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${isTurnStep1 ? `
                          <button class="btn-primary" style="padding:5px 8px; font-size:11.5px;" onclick="App.handleSequentialApproval('${doc.id}', 1, true)">1차 승인</button>
                          <button class="btn-logout" style="padding:5px 8px; font-size:11.5px; color:#dc2626;" onclick="App.handleSequentialApproval('${doc.id}', 1, false)">반려</button>
                        ` : ""}
                        ${isTurnStep2 ? `
                          <button class="btn-primary" style="padding:5px 8px; font-size:11.5px; background:#059669;" onclick="App.handleSequentialApproval('${doc.id}', 2, true)">최종 승인</button>
                          <button class="btn-logout" style="padding:5px 8px; font-size:11.5px; color:#dc2626;" onclick="App.handleSequentialApproval('${doc.id}', 2, false)">반려</button>
                        ` : ""}
                        ${canEdit ? `
                          <button class="btn-logout" style="padding:5px 8px; font-size:11.5px; color:#2563eb; border-color:#bfdbfe;" onclick="App.startEditLeaveRequest('${doc.id}')">✏️ 수정</button>
                        ` : ""}
                        ${canCancel ? `
                          <button class="btn-logout" style="padding:5px 8px; font-size:11.5px; color:#dc2626; border-color:#fecaca;" onclick="App.handleCancelLeaveRequest('${doc.id}')">
                            ${doc.status === "APPROVED" ? "🔄 휴가취소(연차복구)" : "🗑️ 상신취소"}
                          </button>
                        ` : ""}
                        ${doc.status === "CANCELED" && (isMyDoc || Auth.isAdmin(user)) ? `
                          <button class="btn-logout" title="취소된 신청서 삭제" style="padding:4px 9px; font-size:12px; font-weight:700; color:#64748b; border-color:#cbd5e1;" onclick="App.handleDeleteCanceledLeave('${doc.id}')">✕</button>
                        ` : ""}
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;

      const updateLeavePreview = () => {
        const typeVal = document.getElementById("ap-type").value;
        const startVal = document.getElementById("ap-start").value;
        const endInput = document.getElementById("ap-end");
        const previewEl = document.getElementById("calc-preview-text");
        const detailEl = document.getElementById("calc-exclude-detail");

        if (typeVal.includes("반차")) {
          endInput.value = startVal;
        }
        const endVal = endInput.value;
        const calc = this.calculateWorkingDays(startVal, endVal);

        let reqDays = 0;
        if (typeVal.includes("미차감")) {
          reqDays = 0;
        } else if (typeVal.includes("반차")) {
          reqDays = calc.workingDays > 0 ? 0.5 : 0;
        } else {
          reqDays = calc.workingDays;
        }

        const excludedParts = [];
        if (calc.weekendCount > 0) excludedParts.push(`주말 ${calc.weekendCount}일`);
        if (calc.holidayNames.length > 0) excludedParts.push(`공휴일 ${calc.holidayNames.length}일(${calc.holidayNames.join(", ")})`);

        if (excludedParts.length > 0) {
          detailEl.textContent = `총 ${calc.totalSpanDays}일 중 ${excludedParts.join(" · ")} 자동 제외됨`;
          detailEl.style.color = "#2563eb";
        } else {
          detailEl.textContent = `평일 기준 ${reqDays}일 적용`;
          detailEl.style.color = "#64748b";
        }

        const expectedRemain = Number((remainLeave - reqDays).toFixed(1));
        if (reqDays === 0 && !typeVal.includes("미차감")) {
          previewEl.style.color = "#dc2626";
          previewEl.textContent = `0일 (선택 기간이 모두 휴일입니다)`;
        } else if (expectedRemain < 0) {
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
        if (reqDays <= 0 && !leaveType.includes("미차감")) {
          return alert("선택하신 기간은 모두 주말 또는 공휴일이어서 차감할 평일이 없습니다.");
        }
        if (expectedRemain < 0) {
          return alert(`잔여 연차(${remainLeave}일)가 부족하여 ${reqDays}일 휴가를 신청할 수 없습니다.`);
        }

        try {
          if (this.editingLeaveDocId) {
            const targetDoc = (db.leaveRequests || []).find(d => String(d.id) === String(this.editingLeaveDocId));
            await StorageDB.updateLeaveRequest(this.editingLeaveDocId, {
              leave_type: leaveType,
              start_date: startDate,
              end_date: endDate,
              days: reqDays,
              reason,
              approver1_id: this.selectedApprover1.id,
              approver1_name: `${this.selectedApprover1.name} ${this.selectedApprover1.position || ""}`.trim(),
              approver2_id: this.selectedApprover2.id,
              approver2_name: `${this.selectedApprover2.name} ${this.selectedApprover2.position || ""}`.trim()
            }, targetDoc);
            this.editingLeaveDocId = null;
            this.showToast("✏️ 휴가 신청서가 수정되어 재상신되었습니다!");
          } else {
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
              approver1_name: `${this.selectedApprover1.name} ${this.selectedApprover1.position || ""}`.trim(),
              approver1_status: "WAITING",
              approver2_id: this.selectedApprover2.id,
              approver2_name: `${this.selectedApprover2.name} ${this.selectedApprover2.position || ""}`.trim(),
              approver2_status: "WAITING",
              status: "PENDING_1"
            });
            this.showToast(`휴가 신청서(실차감 ${reqDays}일)가 상신되었습니다!`);
          }
          this.navigateTo("approval");
        } catch (err) {
          alert(err.message);
        }
      };
      return;
    }

    // 2. 전사 휴가 캘린더 (월간 그리드 달력 + 겹치는 휴가 자동 스태킹)
    if (pageKey === "leave-calendar") {
      const approved = (db.leaveRequests || []).filter(r => r.status === "APPROVED");
      container.innerHTML = `
        <div class="card">
          ${this.renderMonthlyGridCalendar(approved)}
        </div>
      `;
      return;
    }

    // 3. 관리자 전용 페이지
    if (pageKey === "admin") {
      if (!Auth.isAdmin(user)) {
        container.innerHTML = `<div class="card"><h3>⛔ 시스템 관리자만 접근할 수 있는 메뉴입니다.</h3></div>`;
        return;
      }

      const allUsers = db.users || [];
      const pendingUsers = allUsers.filter(u => u.approvalStatus === "PENDING");
      const customHolidays = this.getCustomHolidays();
      const customEntries = Object.entries(customHolidays).sort((a, b) => a[0].localeCompare(b[0]));

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

        <div class="card" style="margin-bottom:18px; border-left:4px solid #10b981;">
          <div class="card-header"><h4>📅 법정공휴일·대체공휴일 자동 연동 현황 및 임시공휴일 추가</h4></div>
          <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
            <input type="date" id="custom-hol-date" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <input type="text" id="custom-hol-name" placeholder="예: 회사 창립기념일, 정부 임시공휴일" style="flex:1; min-width:200px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button type="button" class="btn-primary" id="btn-add-custom-hol" style="background:#059669;">+ 사내 휴일 추가</button>
          </div>
          ${customEntries.length > 0 ? `
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${customEntries.map(([d, name]) => `
                <span style="background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; padding:4px 10px; border-radius:99px; font-size:12px;">
                  ${d} (${name}) <button onclick="App.removeCustomHoliday('${d}')" style="border:none; background:none; color:#dc2626; cursor:pointer; font-weight:700;">✕</button>
                </span>
              `).join("")}
            </div>
          ` : ""}
        </div>

        <div class="card">
          <div class="card-header"><h4>👥 임직원별 연차 부여 및 잔여 일수 관리 (${allUsers.length}명)</h4></div>
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

      document.getElementById("btn-add-custom-hol").onclick = () => {
        const d = document.getElementById("custom-hol-date").value;
        const name = document.getElementById("custom-hol-name").value.trim();
        if (!d || !name) return alert("날짜와 휴일 명칭을 모두 입력해 주세요.");
        const map = this.getCustomHolidays();
        map[d] = name;
        localStorage.setItem(CUSTOM_HOLIDAY_STORAGE_KEY, JSON.stringify(map));
        this.showToast(`${d} (${name}) 휴일이 등록되었습니다.`);
        this.navigateTo("admin");
      };
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

    // 5. 사내 게시판 (클릭 상세보기 + 관리자 전체 수정/삭제)
    if (pageKey === "board") {
      const isAdmin = Auth.isAdmin(user);
      this.attach.b = null;
      container.innerHTML = `
        <div class="card" style="margin-bottom:18px;">
          <div class="card-header"><h4>✍️ 사내 게시판 새 글 작성 (${user.name} ${user.position})</h4></div>
          <div class="form-row" style="display:flex; gap:8px; margin-bottom:8px;">
            <select id="b-cat" style="padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
              <option value="자유 게시판">자유 게시판</option>
              <option value="업무 공유 게시판">업무 공유 게시판</option>
              <option value="부서별 게시판">부서별 게시판</option>
            </select>
            <input id="b-title" type="text" placeholder="제목을 입력하세요" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
            <button class="btn-primary" id="btn-save-board">게시글 등록</button>
          </div>
          <textarea id="b-content" rows="2" placeholder="내용을 입력하세요" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
          ${this.attachWidgetHtml("b")}
        </div>
        <div class="card">
          <div class="card-header"><h4>💬 전체 게시글 목록 (${(db.boardPosts || []).length}건) · 제목을 클릭하면 상세 내용을 볼 수 있습니다</h4></div>
          <table class="list-table">
            <thead><tr><th>분류</th><th>제목 / 내용</th><th>작성자</th><th>작성일</th><th>관리</th></tr></thead>
            <tbody>
              ${(db.boardPosts || []).length === 0 ? `<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">등록된 게시글이 없습니다.</td></tr>` : ""}
              ${(db.boardPosts || []).map((b, idx) => {
                const canManage = isAdmin || (b.author || "").includes(user.name);
                return `
                  <tr>
                    <td><span class="status-badge status-IN_PROGRESS">${b.category}</span></td>
                    <td style="cursor:pointer;" onclick="App.openPostModal('board', ${idx}, false)">
                      <strong style="color:#1e3a8a; text-decoration:underline; text-underline-offset:3px;">${b.title}</strong><br/>
                      <span style="color:#64748b; font-size:12px;">${this.postPreviewHtml(b.content)}</span>
                    </td>
                    <td>${b.author}</td>
                    <td>${b.date}</td>
                    <td>
                      ${canManage ? `
                        <button class="link-btn" style="margin-right:8px;" onclick="App.openPostModal('board', ${idx}, true)">수정</button>
                        <button class="link-btn" style="color:#dc2626;" onclick="App.deletePost('board', ${idx})">삭제</button>
                      ` : "-"}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
      document.getElementById("btn-save-board").onclick = () => {
        const title = document.getElementById("b-title").value.trim();
        const content = this.buildPostContent(document.getElementById("b-content").value, this.attach.b);
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

    // 6. 회사 공지사항 (시스템 관리자 전용 등록/수정/삭제, 그 외 임직원은 열람 전용)
    if (pageKey === "notice") {
      const canEditNotice = user && user.role === "ADMIN";
      this.attach.n = null;
      container.innerHTML = `
        ${canEditNotice ? `
          <div class="card" style="margin-bottom:18px;">
            <div class="card-header"><h4>📢 신규 공지사항 등록 (관리자 전용)</h4></div>
            <div class="form-row" style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <input id="n-title" type="text" placeholder="공지 제목을 입력하세요" style="flex:1; min-width:200px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" />
              <label style="display:flex; align-items:center; gap:4px; font-size:13px; font-weight:600; cursor:pointer;">
                <input type="checkbox" id="n-pin" /> 중요 공지(상단고정)
              </label>
              <button class="btn-primary" id="btn-save-notice">공지 등록</button>
            </div>
            <textarea id="n-content" rows="2" placeholder="공지 상세 내용" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
            ${this.attachWidgetHtml("n")}
          </div>
        ` : ""}
        <div class="card">
          <div class="card-header"><h4>📌 공지사항 목록 (${(db.notices || []).length}건) · 제목을 클릭하면 상세 내용을 볼 수 있습니다</h4></div>
          <table class="list-table">
            <thead>
              <tr>
                <th>구분</th>
                <th>제목 / 내용</th>
                <th>작성자</th>
                <th>작성일</th>
                ${canEditNotice ? "<th>관리</th>" : ""}
              </tr>
            </thead>
            <tbody>
              ${(db.notices || []).length === 0 ? `<tr><td colspan="${canEditNotice ? 5 : 4}" style="text-align:center; padding:20px; color:#94a3b8;">등록된 공지사항이 없습니다.</td></tr>` : ""}
              ${(db.notices || []).map((n, idx) => `
                <tr>
                  <td>${n.pinned ? '<span class="status-badge status-REJECTED">중요</span>' : '<span class="status-badge status-IN_PROGRESS">일반</span>'}</td>
                  <td style="cursor:pointer;" onclick="App.openPostModal('notice', ${idx}, false)">
                    <strong style="color:#1e3a8a; text-decoration:underline; text-underline-offset:3px;">${n.title}</strong><br/>
                    <span style="color:#64748b; font-size:12px;">${this.postPreviewHtml(n.content)}</span>
                  </td>
                  <td>${n.author}</td>
                  <td>${n.date}</td>
                  ${canEditNotice ? `
                    <td>
                      <button class="link-btn" style="margin-right:8px;" onclick="App.openPostModal('notice', ${idx}, true)">수정</button>
                      <button class="link-btn" style="color:#dc2626;" onclick="App.deletePost('notice', ${idx})">삭제</button>
                    </td>
                  ` : ""}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

      if (canEditNotice) {
        document.getElementById("btn-save-notice").onclick = () => {
          const title = document.getElementById("n-title").value.trim();
          const content = this.buildPostContent(document.getElementById("n-content").value, this.attach.n);
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
      }
      return;
    }
  },

  removeCustomHoliday(dateStr) {
    const map = this.getCustomHolidays();
    delete map[dateStr];
    localStorage.setItem(CUSTOM_HOLIDAY_STORAGE_KEY, JSON.stringify(map));
    this.showToast("사내 지정 휴일이 삭제되었습니다.");
    this.navigateTo("admin");
  },

  getLeaveStatusLabel(status) {
    const map = {
      PENDING_1: "1차 결재 대기",
      PENDING_2: "1차 승인 (최종 대기)",
      APPROVED: "최종 승인 (연차차감)",
      REJECTED: "결재 반려",
      CANCELED: "취소됨 (연차복구)",
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

  // 취소된 휴가 신청서(CANCELED) '✕' 버튼 클릭 시 영구 삭제
  async handleDeleteCanceledLeave(docId) {
    if (!confirm("취소된 휴가 내역을 목록에서 완전히 삭제하시겠습니까?")) return;
    try {
      await StorageDB.deleteLeaveRecord(docId);
      this.showToast("취소된 신청서가 목록에서 삭제되었습니다.");
      this.navigateTo("approval");
    } catch (err) {
      alert(err.message);
    }
  },

  // 공지사항 / 게시판 상세 보기 및 수정 모달 열기
  openPostModal(type, idx, startInEditMode = false) {
    const db = StorageDB.getData();
    const user = Auth.getCurrentUser();
    const list = type === "notice" ? (db.notices || []) : (db.boardPosts || []);
    const item = list[idx];
    if (!item) return;

    this.activePostTarget = { type, idx };
    const isAdmin = Auth.isAdmin(user);
    const canManage = type === "notice"
      ? (user && user.role === "ADMIN")
      : (isAdmin || (item.author || "").includes(user.name));

    const viewArea = document.getElementById("post-view-area");
    const editArea = document.getElementById("post-edit-area");
    const headerEl = document.getElementById("post-modal-header");

    if (startInEditMode && canManage) {
      headerEl.textContent = type === "notice" ? "✏️ 공지사항 수정" : "✏️ 게시글 수정";
      viewArea.classList.add("hidden");
      editArea.classList.remove("hidden");

      document.getElementById("post-edit-cat-wrap").classList.toggle("hidden", type === "notice");
      document.getElementById("post-edit-pin-wrap").classList.toggle("hidden", type !== "notice");

      if (type === "notice") {
        document.getElementById("post-edit-pin").checked = Boolean(item.pinned);
      } else {
        document.getElementById("post-edit-cat").value = item.category || "자유 게시판";
      }

      document.getElementById("post-edit-title").value = item.title || "";
      const parsedEdit = this.parsePostContent(item.content);
      document.getElementById("post-edit-content").value = parsedEdit.text;
      // 기존 첨부 이미지는 미리보기로만 보여주고 Base64 원문은 노출하지 않음
      this.attach.e = parsedEdit.image || null;
      this.renderAttachPreview("e");
      const editFile = document.getElementById("attach-e-file");
      if (editFile) editFile.value = "";

      const authorInput = document.getElementById("post-edit-author");
      authorInput.value = item.author || "";
      // 관리자는 작성자명을 자유롭게 수정 가능, 일반 직원은 본인 이름 고정
      authorInput.disabled = !isAdmin;
      document.getElementById("btn-set-my-author").classList.toggle("hidden", !isAdmin);
    } else {
      headerEl.textContent = type === "notice" ? "📢 공지사항 상세" : "💬 게시글 상세";
      editArea.classList.add("hidden");
      viewArea.classList.remove("hidden");

      document.getElementById("post-view-badge").innerHTML = type === "notice"
        ? (item.pinned ? '<span class="status-badge status-REJECTED">중요 공지</span>' : '<span class="status-badge status-IN_PROGRESS">일반 공지</span>')
        : `<span class="status-badge status-IN_PROGRESS">${item.category || "게시판"}</span>`;

      document.getElementById("post-view-meta").textContent = `작성자: ${item.author || "-"} · 작성일: ${item.date || "-"}`;
      document.getElementById("post-view-title").textContent = item.title || "";
      const parsedView = this.parsePostContent(item.content);
      const viewContentEl = document.getElementById("post-view-content");
      viewContentEl.textContent = parsedView.text || (parsedView.image ? "" : "(내용 없음)");
      if (parsedView.image) {
        const img = document.createElement("img");
        img.src = parsedView.image;
        img.alt = "첨부 이미지";
        img.className = "post-image";
        img.addEventListener("click", () => this.openImageViewer(parsedView.image));
        viewContentEl.appendChild(img);
      }

      document.getElementById("post-view-actions").innerHTML = `
        ${canManage ? `
          <button type="button" class="btn-primary" onclick="App.openPostModal('${type}', ${idx}, true)">✏️ 수정하기</button>
          <button type="button" class="btn-logout" style="color:#dc2626; border-color:#fecaca;" onclick="App.deletePost('${type}', ${idx})">🗑️ 삭제</button>
        ` : ""}
        <button type="button" class="btn-logout" onclick="App.closePostModal()">닫기</button>
      `;
    }

    document.getElementById("post-modal").classList.remove("hidden");
  },

  fillMyAuthorName() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    document.getElementById("post-edit-author").value = `${user.name} ${user.position}`;
  },

  savePostEdit() {
    if (!this.activePostTarget) return;
    const { type, idx } = this.activePostTarget;
    const db = StorageDB.getData();
    const list = type === "notice" ? db.notices : db.boardPosts;
    if (!list || !list[idx]) return;

    const title = document.getElementById("post-edit-title").value.trim();
    const author = document.getElementById("post-edit-author").value.trim();
    const content = this.buildPostContent(document.getElementById("post-edit-content").value, this.attach.e);
    if (!title) return alert("제목을 입력해 주세요.");

    list[idx].title = title;
    list[idx].author = author || list[idx].author;
    list[idx].content = content;
    if (type === "notice") {
      list[idx].pinned = document.getElementById("post-edit-pin").checked;
    } else {
      list[idx].category = document.getElementById("post-edit-cat").value;
    }

    StorageDB.saveData(db);
    this.closePostModal();
    this.showToast("수정 사항이 Supabase에 저장되었습니다.");
    this.navigateTo(type);
  },

  deletePost(type, idx) {
    if (!confirm("이 글을 정말 삭제하시겠습니까?")) return;
    const db = StorageDB.getData();
    const list = type === "notice" ? db.notices : db.boardPosts;
    if (!list || !list[idx]) return;

    list.splice(idx, 1);
    StorageDB.saveData(db);
    this.closePostModal();
    this.showToast("삭제되었습니다.");
    this.navigateTo(type);
  },

  closePostModal() {
    this.activePostTarget = null;
    this.attach.e = null;
    document.getElementById("post-modal").classList.add("hidden");
  },

  // ===================================================================
  // 이미지 첨부 (공지사항 / 게시판)
  // - 별도 테이블·Storage 없이 기존 content 문자열 끝에 "\n[IMG_DATA:<dataURL>]" 형태로 저장
  // - 클라이언트에서 Canvas로 가로 최대 1000px, JPEG(품질 0.82)로 압축 후 Base64 변환
  // - app_state 한 행에 모든 글이 들어가고 5초마다 동기화되므로, 이미지 1장당 용량 상한(약 300KB)을 둠
  // ===================================================================
  attach: { n: null, b: null, e: null },
  IMG_MARK: "\n[IMG_DATA:",
  IMG_MAX_WIDTH: 1000,
  IMG_QUALITY: 0.82,
  IMG_MAX_CHARS: 400000, // Base64 문자열 길이 상한 (원본 약 300KB)

  // 저장된 content → { text, image } 분리 (목록/수정창에서 Base64 원문이 보이지 않도록)
  parsePostContent(raw) {
    const s = String(raw || "");
    const start = s.indexOf(this.IMG_MARK);
    if (start === -1) return { text: s.trim(), image: null };
    const end = s.indexOf("]", start + this.IMG_MARK.length);
    const dataUrl = s.slice(start + this.IMG_MARK.length, end === -1 ? undefined : end);
    const text = (s.slice(0, start) + (end === -1 ? "" : s.slice(end + 1))).trim();
    return { text, image: /^data:image\/[a-z+]+;base64,/i.test(dataUrl) ? dataUrl : null };
  },

  // 본문 텍스트 + 첨부 이미지 → 저장용 content 문자열
  buildPostContent(text, image) {
    const base = String(text || "").trim();
    return image ? `${base}${this.IMG_MARK}${image}]` : base;
  },

  // 목록용 미리보기 (이미지는 문구로 대체하고 HTML 이스케이프)
  postPreviewHtml(raw) {
    const { text, image } = this.parsePostContent(raw);
    const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const short = text.length > 60 ? text.slice(0, 60) + "..." : text;
    return `${esc(short)}${image ? ' <span class="img-chip">🖼 사진</span>' : ""}`;
  },

  // 첨부 입력 위젯 (n: 공지 작성, b: 게시판 작성, e: 수정 모달)
  attachWidgetHtml(key) {
    return `
      <div class="attach-box">
        <label class="attach-btn" for="attach-${key}-file">🖼 이미지 첨부</label>
        <input type="file" id="attach-${key}-file" accept="image/*" hidden onchange="App.handleImageSelect('${key}', this)" />
        <span class="attach-hint">가로 1000px 이하로 자동 압축됩니다</span>
        <div id="attach-${key}-preview" class="attach-preview hidden"></div>
      </div>
    `;
  },

  renderAttachPreview(key) {
    const box = document.getElementById(`attach-${key}-preview`);
    if (!box) return;
    const img = this.attach[key];
    if (!img) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = `
      <img src="${img}" alt="미리보기" />
      <button type="button" class="attach-remove" onclick="App.removeAttach('${key}')">✕ 삭제</button>
    `;
  },

  removeAttach(key) {
    this.attach[key] = null;
    const input = document.getElementById(`attach-${key}-file`);
    if (input) input.value = "";
    this.renderAttachPreview(key);
  },

  async handleImageSelect(key, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      input.value = "";
      return alert("이미지 파일만 첨부할 수 있습니다.");
    }
    try {
      this.attach[key] = await this.compressImage(file);
      this.renderAttachPreview(key);
    } catch (err) {
      input.value = "";
      alert(err.message || "이미지를 처리하지 못했습니다.");
    }
  },

  // Canvas 압축: 가로 최대 1000px, JPEG 0.82. 용량 상한을 넘으면 품질/폭을 단계적으로 낮춤
  compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const steps = [
          [this.IMG_MAX_WIDTH, this.IMG_QUALITY],
          [this.IMG_MAX_WIDTH, 0.7],
          [800, 0.7],
          [640, 0.6]
        ];
        for (const [maxW, q] of steps) {
          const scale = Math.min(1, maxW / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff"; // 투명 PNG가 JPEG에서 검게 나오지 않도록 흰 배경
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", q);
          if (dataUrl.length <= this.IMG_MAX_CHARS) return resolve(dataUrl);
        }
        reject(new Error("이미지 용량이 너무 큽니다. 더 작은 이미지를 선택해 주세요."));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("이미지를 읽을 수 없습니다. 다른 파일을 선택해 주세요."));
      };
      img.src = url;
    });
  },

  // 이미지 원본 크기 보기 (확대 뷰어)
  openImageViewer(src) {
    const v = document.getElementById("image-viewer");
    if (!v) return;
    v.querySelector("img").src = src;
    v.classList.remove("hidden");
  },

  closeImageViewer() {
    const v = document.getElementById("image-viewer");
    if (v) v.classList.add("hidden");
  },

  getNotificationTargetPage(message = "") {
    if (message.includes("가입")) return "admin";
    if (message.includes("캘린더") || message.includes("최종 승인 완료")) return "leave-calendar";
    if (message.includes("결재") || message.includes("휴가") || message.includes("연차") || message.includes("반려") || message.includes("취소")) return "approval";
    if (message.includes("공지")) return "notice";
    if (message.includes("게시판") || message.includes("게시글")) return "board";
    return "dashboard";
  },

  async handleNotificationClick(notifId) {
    const db = StorageDB.getData();
    const target = (db.notifications || []).find((n) => String(n.id) === String(notifId));
    const targetPage = this.getNotificationTargetPage(target ? target.message : "");

    const dropdown = document.getElementById("notif-dropdown") || document.getElementById("notification-dropdown");
    if (dropdown) dropdown.classList.add("hidden");

    if (target && !target.is_read && typeof StorageDB.markNotificationRead === "function") {
      try {
        await StorageDB.markNotificationRead(notifId);
        this.renderNotificationDropdown();
      } catch (e) {}
    }

    this.navigateTo(targetPage);
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