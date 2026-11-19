/**
 * js/auth.js (1단계: 탭 종료 및 링크 재접속 시 자동 로그아웃되는 sessionStorage 적용)
 */
const TOKEN_KEY = "gw_supabase_access_token";
const USER_PROFILE_KEY = "gw_supabase_user_profile";

// 👇 회원님(마스터 관리자)의 이메일 주소를 유지하세요!
const MASTER_ADMIN_EMAIL = "dyswn123@naver.com";

// 기존 localStorage에 남아있던 영구 로그인 흔적 자동 청소
localStorage.removeItem(TOKEN_KEY);
localStorage.removeItem(USER_PROFILE_KEY);

const Auth = {
  getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  },

  async signup(email, password, name, position, dept) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || data.error_description || "회원가입에 실패했습니다.");

      const token = data.access_token;
      const userId = data.user ? data.user.id : data.id;
      if (!token || !userId) throw new Error("Supabase에서 Confirm email 설정을 꺼주세요.");

      const isMasterAdmin = (email.trim().toLowerCase() === MASTER_ADMIN_EMAIL.trim().toLowerCase());
      const role = isMasterAdmin ? "ADMIN" : (position.includes("대표") ? "CEO" : "USER");
      const approvalStatus = isMasterAdmin ? "APPROVED" : "PENDING";

      const profileRow = {
        id: userId,
        email: email.trim(),
        name: name || "신규직원",
        dept: dept || "미지정",
        position: position || "사원",
        role,
        approval_status: approvalStatus,
        annual_total: 15,
        annual_used: 0
      };

      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify(profileRow)
      });

      if (approvalStatus === "PENDING") {
        return {
          success: true,
          pending: true,
          message: "✅ 가입 신청이 접수되었습니다! 관리자가 [가입승인 및 연차관리] 메뉴에서 승인하면 로그인하실 수 있습니다."
        };
      }

      sessionStorage.setItem(TOKEN_KEY, token);
      const appUser = this.mapProfileToUser(profileRow);
      sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(appUser));
      return { success: true, pending: false, user: appUser };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async login(email, password) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");

      const token = data.access_token;
      const userId = data.user.id;

      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` }
      });
      const rows = await profRes.json();
      let profileRow = rows && rows[0];

      if (!profileRow) throw new Error("등록된 직원 프로필이 없습니다.");

      if (email.trim().toLowerCase() === MASTER_ADMIN_EMAIL.trim().toLowerCase() && profileRow.role !== "ADMIN") {
        profileRow.role = "ADMIN";
        profileRow.approval_status = "APPROVED";
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ role: "ADMIN", approval_status: "APPROVED" })
        });
      }

      if (profileRow.approval_status === "PENDING") {
        throw new Error("⏳ 아직 관리자 승인 대기 중입니다. 관리자에게 사용 승인을 요청해 주세요.");
      }
      if (profileRow.approval_status === "REJECTED") {
        throw new Error("⛔ 가입이 반려되었거나 사용이 중지된 계정입니다.");
      }

      sessionStorage.setItem(TOKEN_KEY, token);
      const appUser = this.mapProfileToUser(profileRow);
      sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(appUser));
      return { success: true, user: appUser };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  mapProfileToUser(p) {
    return {
      id: p.id,
      email: p.email,
      name: p.name,
      dept: p.dept,
      position: p.position,
      phone: p.phone || "",
      role: p.role || "USER",
      approvalStatus: p.approval_status || "APPROVED",
      annualTotal: Number(p.annual_total ?? 15),
      annualUsed: Number(p.annual_used ?? 0)
    };
  },

  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_PROFILE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_PROFILE_KEY);
  },

  getCurrentUser() {
    const raw = sessionStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  saveCurrentUser(userObj) {
    sessionStorage.setItem(USER_PROFILE_KEY, JSON.stringify(userObj));
  },

  getRoleLabel(role) {
    const map = { USER: "일반 직원", MANAGER: "부서장", ADMIN: "시스템 관리자", CEO: "최종 결재권자 (대표이사)" };
    return map[role] || "일반 직원";
  },

  isAdmin(user) {
    return user && (user.role === "ADMIN" || user.role === "CEO");
  }
};