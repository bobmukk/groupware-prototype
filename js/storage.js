/**
 * js/storage.js
 * 브라우저 localStorage를 관리하는 데이터 계층
 * 향후 실제 백엔드 및 DB 연동 시 이 파일의 함수들을 fetch API로 교체합니다.
 */

const STORAGE_KEY = "gw_prototype_phase1_db";
const SESSION_KEY = "gw_prototype_session_user";

const StorageDB = {
  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
    }
  },

  getData() {
    this.init();
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      console.error("Storage parse error:", e);
      return INITIAL_SEED_DATA;
    }
  },

  saveData(newData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  },

  resetToSeed() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
  },

  getSessionUser() {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) return null;
    const db = this.getData();
    return db.users.find(u => u.id === userId) || null;
  },

  setSessionUser(userId) {
    if (!userId) {
      localStorage.removeItem(SESSION_KEY);
    } else {
      localStorage.setItem(SESSION_KEY, userId);
    }
  }
};
