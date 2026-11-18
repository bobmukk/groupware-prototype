/**
 * js/storage.js (2단계: RLS 보안 토큰 기반 정식 테이블 3종 + 공용 게시판 통신 모듈)
 */

// 1. 회원님의 Supabase 프로젝트 URL
const SUPABASE_URL = "https://dttlbhfcdxanjozveuje.supabase.co";

// 👇 2. 여기에 본인의 anon public 키를 붙여넣으세요!
const SUPABASE_ANON_KEY = "sb_publishable_x1BskJJNm56LtqkWKt8RHw_44e7TjKA";

const STORAGE_KEY = "gw_prototype_phase1_db";
const STATE_ROW_ID = "company_main_state";

const StorageDB = {
  // RLS 통과를 위한 인증 헤더 생성 (로그인 토큰 자동 포함)
  getHeaders(isWrite = false) {
    const token = (typeof Auth !== "undefined" && Auth.getToken()) ? Auth.getToken() : SUPABASE_ANON_KEY;
    const headers = {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`
    };
    if (isWrite) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  },

  init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
    }
    this.syncFromCloud();
  },

  // 클라우드에서 최신 데이터 동기화 (재직자 명부 + RLS 적용 휴가 문서 + 내 알림 + 게시판)
  async syncFromCloud() {
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("여기에_")) return;

    try {
      const localDb = this.getData();
      let hasChanged = false;

      // 1) 게시판·공지사항(app_state) 동기화
      const stateRes = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.${STATE_ROW_ID}&select=data`, {
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      if (stateRes.ok) {
        const stateRows = await stateRes.json();
        if (Array.isArray(stateRows) && stateRows.length > 0 && stateRows[0].data) {
          localDb.boardPosts = stateRows[0].data.boardPosts || localDb.boardPosts;
          localDb.notices = stateRows[0].data.notices || localDb.notices;
          hasChanged = true;
        }
      }

      // 로그인 상태일 때만 RLS 보안 테이블(profiles, leave_requests, notifications) 조회
      const currentUser = (typeof Auth !== "undefined") ? Auth.getCurrentUser() : null;
      if (currentUser && Auth.getToken()) {
        // 2) 전체 재직자 명부(profiles) 불러오기 -> 결재자 선택 팝업 및 조직도용
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=name.asc`, {
          headers: this.getHeaders()
        });
        if (profRes.ok) {
          const profiles = await profRes.json();
          if (Array.isArray(profiles) && profiles.length > 0) {
            localDb.users = profiles.map(p => Auth.mapProfileToUser(p));
            hasChanged = true;
          }
        }

        // 3) 휴가 신청서(leave_requests) 불러오기 -> RLS에 의해 내 문서/결재할 문서/승인된 캘린더만 조회됨
        const leaveRes = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?select=*&order=created_at.desc`, {
          headers: this.getHeaders()
        });
        if (leaveRes.ok) {
          const leaves = await leaveRes.json();
          if (Array.isArray(leaves)) {
            localDb.leaveRequests = leaves.map(r => this.mapRowToLeaveDoc(r));
            hasChanged = true;
          }
        }

        // 4) 내게 온 결재 알림(notifications) 불러오기
        const notifRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications?receiver_id=eq.${currentUser.id}&select=*&order=created_at.desc`, {
          headers: this.getHeaders()
        });
        if (notifRes.ok) {
          const notifs = await notifRes.json();
          if (Array.isArray(notifs)) {
            localDb.notifications = notifs;
            hasChanged = true;
          }
        }
      }

      if (hasChanged) {
        const prevStr = localStorage.getItem(STORAGE_KEY);
        const nextStr = JSON.stringify(localDb);
        if (prevStr !== nextStr) {
          localStorage.setItem(STORAGE_KEY, nextStr);
          if (typeof App !== "undefined" && currentUser) {
            if (typeof App.updateNotificationBadge === "function") {
              App.updateNotificationBadge(localDb.notifications || []);
            }
            // 입력창 작성 중이 아닐 때만 화면 자동 갱신
            const activeTag = document.activeElement ? document.activeElement.tagName : "";
            if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
              App.navigateTo(App.currentPage);
            }
          }
        }
      }
    } catch (err) {
      console.warn("클라우드 동기화 대기 중:", err);
    }
  },

  // DB의 leave_requests 행(row)을 화면 UI 구조로 변환
  mapRowToLeaveDoc(r) {
    return {
      id: r.id,
      applicantId: r.applicant_id,
      applicantName: r.applicant_name,
      dept: r.dept,
      position: r.position,
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: Number(r.days),
      reason: r.reason,
      approver1Id: r.approver1_id,
      approver1Name: r.approver1_name,
      approver1Status: r.approver1_status,
      approver2Id: r.approver2_id,
      approver2Name: r.approver2_name,
      approver2Status: r.approver2_status,
      status: r.status, // PENDING_1, PENDING_2, APPROVED, REJECTED
      currentStepIndex: r.status === "PENDING_2" ? 1 : 0,
      approvalLine: [
        { step: 1, userId: r.approver1_id, name: r.approver1_name, status: r.approver1_status },
        { step: 2, userId: r.approver2_id, name: r.approver2_name, status: r.approver2_status }
      ]
    };
  },

  // [핵심 API 1] 신규 휴가 신청서 DB 등록 + 1차 결재자에게 즉시 알림 발송
  async createLeaveRequest(payload) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests`, {
      method: "POST",
      headers: { ...this.getHeaders(true), "Prefer": "return=representation" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "휴가 신청서 저장에 실패했습니다.");
    }

    // 1차 결재자에게 알림 생성
    await this.sendNotification(
      payload.approver1_id,
      `📩 [1차 결재 요청] ${payload.applicant_name} ${payload.position}님이 ${payload.leave_type}(${payload.start_date}~${payload.end_date}) 결재를 요청했습니다.`
    );
    await this.syncFromCloud();
  },

  // [핵심 API 2] 순차 결재 상태 업데이트 + 다음 결재자(또는 신청자)에게 알림 발송
  async processLeaveApproval(doc, stepNumber, isApprove) {
    let updateFields = {};
    if (stepNumber === 1) {
      updateFields = isApprove
        ? { approver1_status: "APPROVED", status: "PENDING_2" }
        : { approver1_status: "REJECTED", status: "REJECTED" };
    } else {
      updateFields = isApprove
        ? { approver2_status: "APPROVED", status: "APPROVED" }
        : { approver2_status: "REJECTED", status: "REJECTED" };
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${doc.id}`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify(updateFields)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "결재 상태 변경에 실패했습니다.");
    }

    // 조건별 자동 알림 발송
    if (stepNumber === 1 && isApprove) {
      // 1차 승인 완료 -> 최종 결재권자에게 알림!
      await this.sendNotification(
        doc.approver2Id,
        `🔔 [최종 결재 요청] ${doc.applicantName}님의 ${doc.leaveType} 신청건이 1차 승인(${doc.approver1Name})되어 최종 결재 대기 중입니다.`
      );
    } else if (stepNumber === 2 && isApprove) {
      // 최종 승인 완료 -> 신청자에게 알림!
      await this.sendNotification(
        doc.applicantId,
        `🎉 [최종 승인 완료] 신청하신 ${doc.leaveType}(${doc.startDate}~${doc.endDate}) 건이 최종 승인되어 휴가 캘린더에 등록되었습니다.`
      );
    } else if (!isApprove) {
      // 반려 시 -> 신청자에게 알림!
      await this.sendNotification(
        doc.applicantId,
        `❌ [결재 반려 알림] 신청하신 ${doc.leaveType}(${doc.startDate}~${doc.endDate}) 건이 반려되었습니다.`
      );
    }

    await this.syncFromCloud();
  },

  // [핵심 API 3] 특정 직원에게 실시간 알림 전송
  async sendNotification(receiverId, message) {
    if (!receiverId) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify({
          receiver_id: receiverId,
          message,
          is_read: false
        })
      });
    } catch (e) {
      console.warn("알림 전송 오류:", e);
    }
  },

  // [핵심 API 4] 내 알림 모두 읽음 처리
  async markAllNotificationsRead(userId) {
    if (!userId) return;
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?receiver_id=eq.${userId}&is_read=eq.false`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify({ is_read: true })
    });
    await this.syncFromCloud();
  },

  // 게시판/공지사항 저장용
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
          data: { boardPosts: dataObj.boardPosts || [], notices: dataObj.notices || [] },
          updated_at: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error("게시판 저장 실패:", err);
    }
  },

  getData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_SEED_DATA;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.notifications) parsed.notifications = [];
      return parsed;
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

  setSessionUser() {}
};

// 5초마다 새로운 결재 요청이나 알림이 왔는지 자동 동기화
setInterval(() => {
  StorageDB.syncFromCloud();
}, 5000);