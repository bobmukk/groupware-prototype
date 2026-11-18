/**
 * js/auth.js (Supabase 실제 회원가입 및 로그인 연동)
 */

const Auth = {
  // 1. 회원가입 처리
  async signup(email, password, nameAndPos, dept) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || data.error_description || "회원가입에 실패했습니다.");

      // 가입 성공 시, DB의 사용자 목록에 자동 등록
      const db = StorageDB.getData();
      const parts = nameAndPos.split(" ");
      const name = parts[0] || "임직원";
      const position = parts[1] || "사원";

      const newUser = {
        id: data.id || email,
        email,
        name,
        dept,
        position,
        duty: "팀원",
        role: dept === "임원실" ? "CEO" : "USER",
        phone: "010-0000-0000",
        annualTotal: 15,
        annualUsed: 0
      };

      // 중복 체크 후 추가
      if (!db.users.some(u => u.email === email)) {
        db.users.push(newUser);
        StorageDB.saveData(db);
      }

      return { success: true, user: newUser };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // 2. 로그인 처리
  async login(email, password) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || "이메일 또는 비밀번호가 올바르지 않습니다.");

      const db = StorageDB.getData();
      let user = db.users.find(u => u.email === email);

      // 만약 DB 목록에 없으면 기본 생성
      if (!user) {
        user = {
          id: data.user?.id || email,
          email,
          name: email.split("@")[0],
          dept: "개발팀",
          position: "사원",
          duty: "팀원",
          role: "USER",
          phone: "010-0000-0000",
          annualTotal: 15,
          annualUsed: 0
        };
        db.users.push(user);
        StorageDB.saveData(db);
      }

      StorageDB.setSessionUser(user.id);
      return { success: true, user };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  logout() {
    StorageDB.setSessionUser(null);
  },

  getCurrentUser() {
    return StorageDB.getSessionUser();
  },

  getRoleLabel(role) {
    const map = {
      USER: "일반 직원",
      MANAGER: "부서장",
      ADMIN: "시스템 관리자",
      CEO: "최종 결재권자 (대표이사)"
    };
    return map[role] || "일반 직원";
  },

  isAdmin(user) {
    return user && (user.role === "ADMIN" || user.role === "CEO");
  }
};