/**
 * js/storage.js (휴가 수정 / 상신 취소 / 승인된 휴가 취소 시 연차 자동 환급 포함)
 */

const SUPABASE_URL = "https://dttlbhfcdxanjozveuje.supabase.co";

// 👇 본인의 anon public 키를 그대로 유지하세요!
const SUPABASE_ANON_KEY = "sb_publishable_x1BskJJNm56LtqkWKt8RHw_44e7TjKA";

const STORAGE_KEY = "gw_prototype_phase1_db";
const STATE_ROW_ID = "company_main_state";

const StorageDB = {
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

  async syncFromCloud() {
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("여기에_")) return;

    try {
      const localDb = this.getData();
      let hasChanged = false;

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

      const currentUser = (typeof Auth !== "undefined") ? Auth.getCurrentUser() : null;
      if (currentUser && Auth.getToken()) {
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=name.asc`, {
          headers: this.getHeaders()
        });
        if (profRes.ok) {
          const profiles = await profRes.json();
          if (Array.isArray(profiles) && profiles.length > 0) {
            localDb.users = profiles.map(p => ({
              ...Auth.mapProfileToUser(p),
              phone: p.phone || ""
            }));
            const myLatest = localDb.users.find(u => u.id === currentUser.id);
            if (myLatest) {
              localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(myLatest));
              if (typeof App !== "undefined" && typeof App.updateHeaderUserInfo === "function") {
                App.updateHeaderUserInfo(myLatest);
              }
            }
            hasChanged = true;
          }
        }

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
      status: r.status
    };
  },

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

    await this.sendNotification(
      payload.approver1_id,
      `📩 [1차 결재 요청] ${payload.applicant_name} ${payload.position}님이 ${payload.leave_type}(${payload.days}일, ${payload.start_date}~${payload.end_date}) 결재를 요청했습니다.`
    );
    await this.syncFromCloud();
  },

  // [추가 1] 결재 대기 중인 내 휴가 신청서 내용(날짜/종류/사유) 수정
  async updateLeaveRequest(docId, updatedFields, doc) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${docId}`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify({
        ...updatedFields,
        approver1_status: "WAITING",
        approver2_status: "WAITING",
        status: "PENDING_1"
      })
    });
    if (!res.ok) throw new Error("휴가 신청서 수정에 실패했습니다.");

    if (doc && doc.approver1Id) {
      await this.sendNotification(
        doc.approver1Id,
        `✏️ [휴가 내용 수정] ${doc.applicantName}님이 휴가 신청 내용을 (${updatedFields.start_date}~${updatedFields.end_date}, ${updatedFields.days}일)로 수정하여 재상신했습니다.`
      );
    }
    await this.syncFromCloud();
  },

  // [추가 2] 휴가 취소 (대기 중인 문서는 삭제 / 최종 승인된 문서는 취소 처리 후 차감된 연차 자동 복구!)
  async cancelLeaveRequest(doc) {
    if (doc.status === "APPROVED") {
      // 1) 상태를 CANCELED(취소됨)로 변경
      const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${doc.id}`, {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify({ status: "CANCELED" })
      });
      if (!res.ok) throw new Error("승인된 휴가 취소에 실패했습니다.");

      // 2) 차감되었던 사용 연차(annual_used) 자동 환급(차감 복구)
      if (!doc.leaveType.includes("미차감")) {
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${doc.applicantId}&select=annual_used`, {
          headers: this.getHeaders()
        });
        if (profRes.ok) {
          const rows = await profRes.json();
          const currentUsed = Number(rows?.[0]?.annual_used || 0);
          const refundedUsed = Math.max(0, Number((currentUsed - Number(doc.days)).toFixed(1)));
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${doc.applicantId}`, {
            method: "PATCH",
            headers: this.getHeaders(true),
            body: JSON.stringify({ annual_used: refundedUsed })
          });
        }
      }

      await this.sendNotification(
        doc.approver2Id,
        `🔄 [승인 휴가 취소] ${doc.applicantName}님이 승인된 ${doc.leaveType}(${doc.startDate}~${doc.endDate}, ${doc.days}일) 일정을 취소하여 연차가 복구되었습니다.`
      );
    } else {
      // 결재 대기 중이거나 반려된 문서는 깔끔하게 삭제
      const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${doc.id}`, {
        method: "DELETE",
        headers: this.getHeaders()
      });
      if (!res.ok) throw new Error("휴가 상신 취소에 실패했습니다.");
    }

    await this.syncFromCloud();
  },

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

    if (stepNumber === 1 && isApprove) {
      await this.sendNotification(
        doc.approver2Id,
        `🔔 [최종 결재 요청] ${doc.applicantName}님의 ${doc.leaveType}(${doc.days}일) 건이 1차 승인되어 최종 결재 대기 중입니다.`
      );
    } else if (stepNumber === 2 && isApprove) {
      if (!doc.leaveType.includes("미차감")) {
        const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${doc.applicantId}&select=annual_used`, {
          headers: this.getHeaders()
        });
        if (profRes.ok) {
          const rows = await profRes.json();
          const currentUsed = Number(rows?.[0]?.annual_used || 0);
          const nextUsed = Number((currentUsed + Number(doc.days)).toFixed(1));
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${doc.applicantId}`, {
            method: "PATCH",
            headers: this.getHeaders(true),
            body: JSON.stringify({ annual_used: nextUsed })
          });
        }
      }

      await this.sendNotification(
        doc.applicantId,
        `🎉 [최종 승인 완료] 신청하신 ${doc.leaveType}(${doc.days}일) 건이 최종 승인되어 연차 및 휴가 캘린더에 반영되었습니다.`
      );
    } else if (!isApprove) {
      await this.sendNotification(
        doc.applicantId,
        `❌ [결재 반려 알림] 신청하신 ${doc.leaveType}(${doc.startDate}~${doc.endDate}) 건이 반려되었습니다.`
      );
    }

    await this.syncFromCloud();
  },

  async bulkUpdateAnnualLeave(totalDays, resetUsed = false) {
    const bodyData = resetUsed
      ? { annual_total: Number(totalDays), annual_used: 0 }
      : { annual_total: Number(totalDays) };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=not.is.null`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify(bodyData)
    });
    if (!res.ok) throw new Error("일괄 연차 부여에 실패했습니다.");
    await this.syncFromCloud();
  },

  async updateSingleUserLeave(userId, annualTotal, annualUsed) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify({
        annual_total: Number(annualTotal),
        annual_used: Number(annualUsed)
      })
    });
    if (!res.ok) throw new Error("연차 정보 수정에 실패했습니다.");
    await this.syncFromCloud();
  },

  async updateMyProfile(userId, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify(fields)
    });
    if (!res.ok) throw new Error("내 정보 수정에 실패했습니다.");
    await this.syncFromCloud();
  },

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

  async markAllNotificationsRead(userId) {
    if (!userId) return;
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?receiver_id=eq.${userId}&is_read=eq.false`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify({ is_read: true })
    });
    await this.syncFromCloud();
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

setInterval(() => {
  StorageDB.syncFromCloud();
}, 5000);