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
const MASTER_ADMIN_EMAIL = "";

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

  // Supabase Auth 영문 에러 메시지 및 응답 코드를 사용자 친화적인 한글 안내로 변환
  translateSignupError(data, status) {
    const raw = [
      data?.msg,
      data?.message,
      data?.error_description,
      data?.error,
      data?.code,
      data?.error_code
    ].filter(Boolean).join(" ").toLowerCase();

    if (
      raw.includes("already registered") ||
      raw.includes("user_already_exists") ||
      raw.includes("already exists") ||
      raw.includes("email_exists") ||
      raw.includes("duplicate")
    ) {
      return "⚠️ 이미 가입된 이메일입니다. 로그인하시거나 관리자에게 계정 초기화를 요청해 주세요.";
    }
    if (
      raw.includes("password") &&
      (raw.includes("at least") || raw.includes("short") || raw.includes("weak") || raw.includes("6") || raw.includes("length"))
    ) {
      return "⚠️ 비밀번호는 최소 6자리 이상으로 입력해 주세요.";
    }
    if (
      raw.includes("invalid") && raw.includes("email") ||
      raw.includes("unable to validate email") ||
      raw.includes("email_address_invalid") ||
      raw.includes("validation_failed")
    ) {
      return "⚠️ 이메일 주소 형식이 올바르지 않습니다. 다시 확인해 주세요.";
    }
    if (status === 429 || raw.includes("rate limit") || raw.includes("over_email_send_rate_limit") || raw.includes("too many")) {
      return "⚠️ 단시간에 요청이 많아 일시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
    }
    const fallback = data?.msg || data?.message || data?.error_description;
    if (fallback && /[가-힣]/.test(fallback)) return fallback;
    return `⚠️ 회원가입 요청에 실패했습니다${status ? ` (코드: ${status})` : ""}. 입력 정보를 확인하거나 관리자에게 문의해 주세요.`;
  },

  async signup(email, password, name, position, dept) {
    try {
      const cleanEmail = (email || "").trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        throw new Error("⚠️ 이메일 주소 형식이 올바르지 않습니다. (예: user@company.com)");
      }
      if (!password || String(password).length < 6) {
        throw new Error("⚠️ 비밀번호는 최소 6자리 이상으로 입력해 주세요.");
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(this.translateSignupError(data, res.status));
      }

      // Supabase에서 이미 가입된 이메일인 경우 identities가 빈 배열([])로 반환될 수 있음
      const identities = data?.user?.identities ?? data?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        throw new Error("⚠️ 이미 가입된 이메일입니다. 로그인하시거나 관리자에게 계정 초기화를 요청해 주세요.");
      }

      const token = data.access_token || data?.session?.access_token;
      const userId = data.user ? data.user.id : data.id;
      if (!token || !userId) {
        throw new Error("⚠️ 이미 가입된 이메일이거나 Supabase에서 Confirm email 설정이 켜져 있습니다. 로그인하시거나 관리자에게 계정 초기화를 요청해 주세요.");
      }

      const isMasterAdmin = (cleanEmail.toLowerCase() === MASTER_ADMIN_EMAIL.trim().toLowerCase());
      const role = isMasterAdmin ? "ADMIN" : ((position || "").includes("대표") ? "CEO" : "USER");
      const approvalStatus = isMasterAdmin ? "APPROVED" : "PENDING";

      const profileRow = {
        id: userId,
        email: cleanEmail,
        name: name || "신규직원",
        dept: dept || "미지정",
        position: position || "사원",
        role,
        approval_status: approvalStatus,
        hire_date: new Date().toISOString().slice(0, 10),
        use_monthly_accrual: true,
        base_annual_leave: 15,
        leave_adjustment: 0,
        leave_adjustment_year: new Date().getFullYear(),
        annual_total: 15,
        annual_used: 0
      };

      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify(profileRow)
      });

      if (!profRes.ok) {
        const profErr = await profRes.json().catch(() => ({}));
        const errMsg = profErr.message || profErr.msg || profErr.details || profErr.error || profRes.statusText || "알 수 없는 오류";
        throw new Error(`⚠️ 직원 프로필 저장에 실패했습니다 (상태코드 ${profRes.status}: ${errMsg}). 관리자에게 문의해 주세요.`);
      }

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

  // 관리자 전용: 현재 로그인한 관리자 세션(SafeAuthStore)을 덮어쓰지 않고 신규 임직원 계정 직접 생성 + 즉시 APPROVED 등록
  async adminCreateUser({
    email,
    password,
    name,
    dept,
    position,
    role = "USER",
    hireDate = null,
    useMonthlyAccrual = true,
    baseAnnualLeave = 15,
    leaveAdjustment = 0,
    annualTotal = 15
  }) {
    try {
      const cleanEmail = (email || "").trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        throw new Error("⚠️ 이메일 주소 형식이 올바르지 않습니다. (예: user@company.com)");
      }
      if (!password || String(password).length < 6) {
        throw new Error("⚠️ 임시 비밀번호는 최소 6자리 이상으로 입력해 주세요.");
      }
      if (!(name || "").trim() || !(dept || "").trim() || !(position || "").trim()) {
        throw new Error("⚠️ 이름, 부서, 직급을 모두 입력해 주세요.");
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(this.translateSignupError(data, res.status));
      }

      const identities = data?.user?.identities ?? data?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        throw new Error("⚠️ 이미 가입된 이메일입니다. 기존 목록에서 승인 상태를 확인하거나 다른 이메일을 사용해 주세요.");
      }

      const newUserToken = data.access_token || data?.session?.access_token;
      const newUserId = data.user ? data.user.id : data.id;
      if (!newUserId) {
        throw new Error("⚠️ 계정 ID를 확인할 수 없습니다. Supabase Auth 설정(Confirm email 비활성화 여부)을 확인해 주세요.");
      }

      const isMasterAdmin = (cleanEmail.toLowerCase() === MASTER_ADMIN_EMAIL.trim().toLowerCase());
      const finalRole = isMasterAdmin ? "ADMIN" : (role || "USER");
      const baseDays = Number.isFinite(Number(baseAnnualLeave))
        ? Number(baseAnnualLeave)
        : (Number.isFinite(Number(annualTotal)) ? Number(annualTotal) : 15);
      const adjDays = Number.isFinite(Number(leaveAdjustment)) ? Number(leaveAdjustment) : 0;
      const curYear = new Date().getFullYear();
      const cleanHireDate = (hireDate && /^\d{4}-\d{2}-\d{2}$/.test(String(hireDate).trim()))
        ? String(hireDate).trim()
        : null;

      const profileRow = {
        id: newUserId,
        email: cleanEmail,
        name: name.trim(),
        dept: dept.trim(),
        position: position.trim(),
        role: finalRole,
        approval_status: "APPROVED",
        hire_date: cleanHireDate,
        use_monthly_accrual: Boolean(useMonthlyAccrual),
        base_annual_leave: baseDays,
        leave_adjustment: adjDays,
        leave_adjustment_year: curYear,
        annual_total: Number((baseDays + adjDays).toFixed(1)),
        annual_used: 0
      };

      // 신규 계정의 토큰(본인 row INSERT 권한)을 우선 사용하고, 없을 경우 관리자 토큰으로 폴백
      const authToken = newUserToken || this.getToken() || SUPABASE_ANON_KEY;
      let profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(profileRow)
      });

      // 만약 신규 토큰으로 실패했고 관리자 토큰이 별도로 존재하면 관리자 토큰으로 1회 재시도
      if (!profRes.ok && newUserToken && this.getToken() && newUserToken !== this.getToken()) {
        profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${this.getToken()}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify(profileRow)
        });
      }

      if (!profRes.ok) {
        const profErr = await profRes.json().catch(() => ({}));
        const errMsg = profErr.message || profErr.msg || profErr.details || profErr.error || profRes.statusText || "알 수 없는 오류";
        throw new Error(`⚠️ 직원 프로필 저장에 실패했습니다 (상태코드 ${profRes.status}: ${errMsg}).`);
      }

      return {
        success: true,
        user: this.mapProfileToUser(profileRow),
        email: cleanEmail,
        tempPassword: String(password)
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 로그인한 직원 본인 비밀번호 변경 (PUT /auth/v1/user)
  async changePassword(newPassword) {
    try {
      if (!newPassword || String(newPassword).length < 6) {
        throw new Error("⚠️ 새 비밀번호는 최소 6자리 이상으로 입력해 주세요.");
      }
      await this.refreshSessionIfNeeded();
      const token = this.getToken();
      if (!token) {
        throw new Error("⚠️ 로그인 세션이 만료되었습니다. 다시 로그인한 후 시도해 주세요.");
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password: String(newPassword) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = [data?.msg, data?.message, data?.error_description, data?.error, data?.code, data?.error_code]
          .filter(Boolean).join(" ").toLowerCase();
        if (raw.includes("same_password") || raw.includes("different from the old")) {
          throw new Error("⚠️ 기존 비밀번호와 동일한 비밀번호입니다. 다른 비밀번호를 입력해 주세요.");
        }
        if (raw.includes("password") && (raw.includes("at least") || raw.includes("short") || raw.includes("weak") || raw.includes("6"))) {
          throw new Error("⚠️ 새 비밀번호는 최소 6자리 이상이어야 합니다.");
        }
        throw new Error(data?.msg || data?.message || `⚠️ 비밀번호 변경에 실패했습니다 (코드: ${res.status}).`);
      }
      return { success: true };
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
    const baseLeave = Number.isFinite(Number(p.base_annual_leave ?? p.baseAnnualLeave))
      ? Number(p.base_annual_leave ?? p.baseAnnualLeave)
      : Number(p.annual_total ?? p.annualTotal ?? 15);
    const curYear = new Date().getFullYear();
    const adjYear = Number(p.leave_adjustment_year ?? p.leaveAdjustmentYear ?? 0);
    const rawAdj = Number(p.leave_adjustment ?? p.leaveAdjustment ?? 0);
    const activeAdj = (adjYear === curYear && Number.isFinite(rawAdj)) ? rawAdj : 0;
    const useMonthly = (p.use_monthly_accrual ?? p.useMonthlyAccrual) !== false;
    const hireDate = p.hire_date ?? p.hireDate ?? null;

    return {
      id: p.id,
      email: p.email,
      name: p.name,
      dept: p.dept,
      position: p.position,
      phone: p.phone || "",
      role: p.role || "USER",
      approvalStatus: p.approval_status || p.approvalStatus || "APPROVED",
      hireDate,
      hire_date: hireDate,
      useMonthlyAccrual: useMonthly,
      use_monthly_accrual: useMonthly,
      baseAnnualLeave: baseLeave,
      base_annual_leave: baseLeave,
      leaveAdjustment: Number.isFinite(rawAdj) ? rawAdj : 0,
      leave_adjustment: Number.isFinite(rawAdj) ? rawAdj : 0,
      leaveAdjustmentYear: adjYear || null,
      leave_adjustment_year: adjYear || null,
      annualTotal: Number((baseLeave + activeAdj).toFixed(1)),
      annualUsed: Number(p.annual_used ?? p.annualUsed ?? 0)
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