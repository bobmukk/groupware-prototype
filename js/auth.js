/**
 * js/auth.js (아이디 저장 + 로그인 유지(refresh_token 자동갱신) + 모바일 안전 폴백)
 */
const TOKEN_KEY = "gw_supabase_access_token";
const REFRESH_KEY = "gw_supabase_refresh_token";
const EXPIRES_KEY = "gw_supabase_token_expires";
const USER_PROFILE_KEY = "gw_supabase_user_profile";
const SAVED_EMAIL_KEY = "gw_saved_login_email";
const KEEP_LOGIN_KEY = "gw_keep_login_flag";

// 👇 회원님(마스터 관리자)의 이메일 주소를 그대로 입력하세요!
const MASTER_ADMIN_EMAIL = "dyswn123@naver.com";

// 로그인 유지 여부에 따라 localStorage / sessionStorage 자동 선택 + 모바일 메모리 폴백
const SafeAuthStore = {
  _mem: {},
  isPersistent() {
    try { return window.localStorage.getItem(KEEP_LOGIN_KEY) === "1"; } catch (e) { return false; }
  },
  setPersistent(flag) {
    try {
      if (flag) window.localStorage.setItem(KEEP_LOGIN_KEY, "1");
      else window.localStorage.removeItem(KEEP_LOGIN_KEY);
    } catch (e) {}
  },
  get(key) {
    try {
      const s = window.sessionStorage.getItem(key);
      if (s !== null) return s;
    } catch (e) {}
    try {
      const l = window.localStorage.getItem(key);
      if (l !== null) return l;
    } catch (e) {}
    return this._mem[key] ?? null;
  },
  set(key, val, persistent = false) {
    this._mem[key] = val;
    try { window.sessionStorage.setItem(key, val); } catch (e) {}
    try {
      if (persistent) window.localStorage.setItem(key, val);
      else window.localStorage.removeItem(key);
    } catch (e) {}
  },
  remove(key) {
    delete this._mem[key];
    try { window.sessionStorage.removeItem(key); } catch (e) {}
    try { window.localStorage.removeItem(key); } catch (e) {}
  }
};

const Auth = {
  getToken() {
    return SafeAuthStore.get(TOKEN_KEY);
  },

  // 아이디(이메일) 저장 읽기/쓰기
  getSavedEmail() {
    try { return window.localStorage.getItem(SAVED_EMAIL_KEY) || ""; } catch (e) { return ""; }
  },
  setSavedEmail(email, shouldSave) {
    try {
      if (shouldSave && email) window.localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
      else window.localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch (e) {}
  },

  // 로그인 유지 상태일 때 만료된 access_token을 refresh_token으로 자동 연장
  async refreshSessionIfNeeded() {
    const token = this.getToken();
    const refreshToken = SafeAuthStore.get(REFRESH_KEY);
    const expiresAt = Number(SafeAuthStore.get(EXPIRES_KEY) || 0);
    if (!token && !refreshToken) return false;

    // 만료 2분 전이 아니면 기존 토큰 그대로 사용
    if (token && expiresAt && Date.now() < expiresAt - 120000) return true;
    if (!refreshToken) return Boolean(token);

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!res.ok) {
        this.logout();
        return false;
      }
      const data = await res.json();
      const persistent = SafeAuthStore.isPersistent();
      const nextExpires = Date.now() + Number(data.expires_in || 3600) * 1000;
      SafeAuthStore.set(TOKEN_KEY, data.access_token, persistent);
      if (data.refresh_token) SafeAuthStore.set(REFRESH_KEY, data.refresh_token, persistent);
      SafeAuthStore.set(EXPIRES_KEY, String(nextExpires), persistent);
      return true;
    } catch (e) {
      return Boolean(token);
    }
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

      SafeAuthStore.setPersistent(false);
      SafeAuthStore.set(TOKEN_KEY, token, false);
      const appUser = this.mapProfileToUser(profileRow);
      SafeAuthStore.set(USER_PROFILE_KEY, JSON.stringify(appUser), false);
      return { success: true, pending: false, user: appUser };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  async login(email, password, keepLogin = false) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");

      const token = data.access_token;
      const refreshToken = data.refresh_token || "";
      const expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
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

      SafeAuthStore.setPersistent(keepLogin);
      SafeAuthStore.set(TOKEN_KEY, token, keepLogin);
      if (refreshToken) SafeAuthStore.set(REFRESH_KEY, refreshToken, keepLogin);
      SafeAuthStore.set(EXPIRES_KEY, String(expiresAt), keepLogin);

      const appUser = this.mapProfileToUser(profileRow);
      SafeAuthStore.set(USER_PROFILE_KEY, JSON.stringify(appUser), keepLogin);
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
    SafeAuthStore.setPersistent(false);
    SafeAuthStore.remove(TOKEN_KEY);
    SafeAuthStore.remove(REFRESH_KEY);
    SafeAuthStore.remove(EXPIRES_KEY);
    SafeAuthStore.remove(USER_PROFILE_KEY);
  },

  getCurrentUser() {
    const raw = SafeAuthStore.get(USER_PROFILE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  saveCurrentUser(userObj) {
    SafeAuthStore.set(USER_PROFILE_KEY, JSON.stringify(userObj), SafeAuthStore.isPersistent());
  },

  getRoleLabel(role) {
    const map = { USER: "일반 직원", MANAGER: "부서장", ADMIN: "시스템 관리자", CEO: "최종 결재권자 (대표이사)" };
    return map[role] || "일반 직원";
  },

  // 시스템 관리자(ADMIN) 전용. 대표(CEO) 등 다른 권한은 관리자 기능에서 제외됨.
  isAdmin(user) {
    return !!user && user.role === "ADMIN";
  }
};