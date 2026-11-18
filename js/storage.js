/**
 * js/storage.js (Supabase 실시간 클라우드 DB 연동 버전)
 */

// 1. 회원님의 Supabase 주소 (입력 완료됨)
const SUPABASE_URL = "https://dttlbhfcdxanjozveuje.supabase.co";

// 👇 2. 아래 따옴표 안에 Step 2에서 복사한 anon public 키를 붙여넣으세요!
const SUPABASE_ANON_KEY = "sb_publishable_x1BskJJNm56LtqkWKt8RHw_44e7TjKA";

const STORAGE_KEY = "gw_prototype_phase1_db";
const SESSION_KEY = "gw_prototype_session_user";
const STATE_ROW_ID = "company_main_state";

const StorageDB = {
  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
    }
    this.syncFromCloud();
  },

  async syncFromCloud() {
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("여기에_")) return;

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.${STATE_ROW_ID}&select=data`, {
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      const rows = await res.json();

      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
        const serverStr = JSON.stringify(rows[0].data);
        const localStr = localStorage.getItem(STORAGE_KEY);
        if (serverStr !== localStr) {
          localStorage.setItem(STORAGE_KEY, serverStr);
          if (typeof App !== "undefined" && Auth.getCurrentUser()) {
            App.renderQuickAccountButtons();
            App.populateHeaderSwitcher(Auth.getCurrentUser());
            App.navigateTo(App.currentPage);
          }
        }
      } else {
        await this.pushToCloud(this.getData());
      }
    } catch (err) {
      console.warn("클라우드 동기화 대기 중:", err);
    }
  },

  async pushToCloud(dataObj) {
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("여기에_")) return;

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/app_state`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          id: STATE_ROW_ID,
          data: dataObj,
          updated_at: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error("클라우드 저장 실패:", err);
    }
  },

  getData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_SEED_DATA;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return INITIAL_SEED_DATA;
    }
  },

  saveData(newData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    this.pushToCloud(newData);
  },

  resetToSeed() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
    this.pushToCloud(INITIAL_SEED_DATA);
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

setInterval(() => {
  StorageDB.syncFromCloud();
}, 5000);