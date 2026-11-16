/**
 * js/auth.js
 * 테스트 계정 로그인/로그아웃 및 권한(Role) 시뮬레이션 모듈
 */

const Auth = {
  login(userId, password) {
    const db = StorageDB.getData();
    const user = db.users.find(u => u.id === userId && u.password === password);
    if (!user) return { success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." };
    StorageDB.setSessionUser(user.id);
    return { success: true, user };
  },

  quickSwitch(userId) {
    const db = StorageDB.getData();
    const user = db.users.find(u => u.id === userId);
    if (!user) return null;
    StorageDB.setSessionUser(user.id);
    return user;
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
