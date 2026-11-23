/**
 * js/storage.js (휴가 수정 / 상신 취소 / 승인된 휴가 취소 시 연차 자동 환급 포함)
 */

const SUPABASE_URL = "https://dttlbhfcdxanjozveuje.supabase.co";

// 👇 본인의 anon public 키를 그대로 유지하세요!
const SUPABASE_ANON_KEY = "sb_publishable_x1BskJJNm56LtqkWKt8RHw_44e7TjKA";

const STORAGE_KEY = "gw_prototype_phase1_db";
const STATE_ROW_ID = "company_main_state";

// data.js 로드 실패/누락 시에도 앱이 멈추지 않도록 하는 방어용 시드 (매번 새 복사본 반환)
function getSeedData() {
  const base = (typeof INITIAL_SEED_DATA !== "undefined" && INITIAL_SEED_DATA)
    ? INITIAL_SEED_DATA
    : { users: [], departments: [], leaveRequests: [], notices: [], boardPosts: [], notifications: [], boardComments: [] };
  const cloned = JSON.parse(JSON.stringify(base));
  if (!Array.isArray(cloned.boardComments)) cloned.boardComments = [];
  return cloned;
}

/**
 * 입사일(hire_date) 및 월차 적용 여부(use_monthly_accrual) 기반 연차 자동 계산 공통 유틸
 * - 1단계: 월차 (입사 1년 미만, 매 만 1개월 경과 시 1일 발생, 최대 11일)
 * - 2단계: 비례 연차 (전환일 ~ 전환연도 12/31, 0.5일 단위 올림)
 * - 3단계: 정규 연차 / 지정 연차 (매년 1/1 ~ 12/31 자동 갱신)
 */
function calculateUserLeaveSummary(profile, approvedLeaves, today = new Date()) {
  const round1 = (n) => Number(Number(n || 0).toFixed(1));
  const fmtYMD = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const todayDate = (today instanceof Date && !isNaN(today.getTime()))
    ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
    : (() => {
        const s = String(today || "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const [y, m, d] = s.split("-").map(Number);
          return new Date(y, m - 1, d);
        }
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })();

  const currentYear = todayDate.getFullYear();
  const todayStr = fmtYMD(todayDate);

  const p = profile || {};
  const rawHire = String(p.hire_date ?? p.hireDate ?? "").trim().slice(0, 10);
  const hasValidHireDate = /^\d{4}-\d{2}-\d{2}$/.test(rawHire);
  const useMonthlyAccrual = (p.use_monthly_accrual ?? p.useMonthlyAccrual) !== false;

  const baseAnnualLeave = Number.isFinite(Number(p.base_annual_leave ?? p.baseAnnualLeave))
    ? Number(p.base_annual_leave ?? p.baseAnnualLeave)
    : Number.isFinite(Number(p.annual_total ?? p.annualTotal))
    ? Number(p.annual_total ?? p.annualTotal)
    : 15;

  const adjYear = Number(p.leave_adjustment_year ?? p.leaveAdjustmentYear ?? 0);
  const rawAdj = Number(p.leave_adjustment ?? p.leaveAdjustment ?? 0);
  const currentAdjustment = (adjYear === currentYear && Number.isFinite(rawAdj)) ? rawAdj : 0;

  const leavesList = Array.isArray(approvedLeaves)
    ? approvedLeaves
    : (typeof StorageDB !== "undefined" && typeof StorageDB.getData === "function")
    ? (StorageDB.getData().leaveRequests || [])
    : [];

  const targetUserId = p.id ? String(p.id) : null;
  const sumUsedInPeriod = (startStr, endStr) => {
    let sum = 0;
    for (const lv of leavesList) {
      if (!lv) continue;
      const status = lv.status || "APPROVED";
      if (status !== "APPROVED") continue;
      const appId = lv.applicantId ?? lv.applicant_id;
      if (targetUserId && appId && String(appId) !== targetUserId) continue;
      const lType = String(lv.leaveType ?? lv.leave_type ?? "");
      if (lType.includes("미차감")) continue;
      const sDate = String(lv.startDate ?? lv.start_date ?? "").slice(0, 10);
      if (sDate >= startStr && sDate <= endStr) {
        sum += Number(lv.days || 0);
      }
    }
    return round1(sum);
  };

  let phase = "REGULAR";
  let phaseLabel = "정규 연차";
  let periodStart = `${currentYear}-01-01`;
  let periodEnd = `${currentYear}-12-31`;
  let totalLeave = round1(baseAnnualLeave + currentAdjustment);

  // 1) 경력직/즉시 지급 모드(use_monthly_accrual === false) 또는 입사일 미입력: 바로 정규/지정 연차 적용
  if (!useMonthlyAccrual || !hasValidHireDate) {
    if (!useMonthlyAccrual) {
      phase = "IMMEDIATE";
      phaseLabel = "지정 연차 (즉시 지급)";
    } else {
      phase = "REGULAR";
      phaseLabel = "정규 연차";
    }
  } else {
    // 2) 월차 자동 발생 모드 (use_monthly_accrual !== false && hire_date 존재)
    const [hy, hm, hd] = rawHire.split("-").map(Number);
    let ty, tm;
    if (hm === 1 && hd === 1) {
      // 1월 1일 입사자: 입사연도+1년 1월 1일 전환 (비례 구간 생략)
      ty = hy + 1;
      tm = 1;
    } else if (hm === 12) {
      // 12월 입사자(12/2~12/31): hire_date+1년이 속한 달(다음해 12월)의 다음달 1일 -> 입사연도+2년 1월 1일
      ty = hy + 2;
      tm = 1;
    } else {
      // 그 외: hire_date+1년이 속한 달의 다음달 1일
      ty = hy + 1;
      tm = hm + 1;
    }

    const transitionDateStr = `${ty}-${String(tm).padStart(2, "0")}-01`;
    const transitionPrevDate = new Date(ty, tm - 1, 0);
    const transitionPrevDayStr = fmtYMD(transitionPrevDate);
    const transitionYearEndStr = `${ty}-12-31`;

    if (todayStr < transitionDateStr) {
      // [1단계] 월차 구간 (today < transitionDate)
      phase = "MONTHLY";
      phaseLabel = "월차 (입사 1년 미만)";
      let elapsedMonths = 0;
      if (todayStr >= rawHire) {
        elapsedMonths = (todayDate.getFullYear() - hy) * 12 + ((todayDate.getMonth() + 1) - hm);
        if (todayDate.getDate() < hd) {
          elapsedMonths -= 1;
        }
        elapsedMonths = Math.min(11, Math.max(0, elapsedMonths));
      }
      totalLeave = round1(elapsedMonths + currentAdjustment);
      periodStart = rawHire;
      periodEnd = transitionPrevDayStr;
    } else if (tm !== 1 && todayStr >= transitionDateStr && todayStr <= transitionYearEndStr) {
      // [2단계] 비례 연차 구간 (transitionDate <= today <= 전환연도-12-31, 단 전환일이 1월 1일이 아닌 경우)
      phase = "PROPORTIONAL";
      phaseLabel = "비례 연차 (전환기)";
      const remainingMonths = 12 - tm + 1;
      const proportionalLeave = Math.ceil((baseAnnualLeave * (remainingMonths / 12)) * 2) / 2;
      totalLeave = round1(proportionalLeave + currentAdjustment);
      periodStart = transitionDateStr;
      periodEnd = transitionYearEndStr;
    } else {
      // [3단계] 정규 연차 구간 (그 이후 매년 1/1 ~ 12/31)
      phase = "REGULAR";
      phaseLabel = "정규 연차";
      totalLeave = round1(baseAnnualLeave + currentAdjustment);
      periodStart = `${currentYear}-01-01`;
      periodEnd = `${currentYear}-12-31`;
    }
  }

  const usedLeave = sumUsedInPeriod(periodStart, periodEnd);
  const remainingLeave = round1(Math.max(0, totalLeave - usedLeave));

  return {
    phase,
    phaseLabel,
    totalLeave,
    usedLeave,
    remainingLeave,
    periodStart,
    periodEnd,
    periodLabel: `${periodStart.replace(/-/g, ".")} ~ ${periodEnd.replace(/-/g, ".")}`,
    baseAnnualLeave: round1(baseAnnualLeave),
    currentAdjustment: round1(currentAdjustment),
    hireDate: hasValidHireDate ? rawHire : null,
    useMonthlyAccrual
  };
}

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getSeedData()));
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
            if (myLatest && typeof Auth.saveCurrentUser === "function") {
              Auth.saveCurrentUser(myLatest);
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

        const cmtRes = await fetch(`${SUPABASE_URL}/rest/v1/board_comments?select=*&order=created_at.asc`, {
          headers: this.getHeaders()
        });
        if (cmtRes.ok) {
          const cmts = await cmtRes.json();
          if (Array.isArray(cmts)) {
            localDb.boardComments = cmts;
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

  // [추가] 이미 취소됨(CANCELED) 상태인 휴가 신청서 목록에서 영구 삭제
  async deleteLeaveRecord(docId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leave_requests?id=eq.${docId}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error("취소된 문서 삭제에 실패했습니다.");
    await this.syncFromCloud();
  },

  async processLeaveApproval(doc, stepNumber, isApprove) {
    let deductFailed = false;
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
          const upRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${doc.applicantId}`, {
            method: "PATCH",
            headers: { ...this.getHeaders(true), "Prefer": "return=representation" },
            body: JSON.stringify({ annual_used: nextUsed })
          });
          // RLS 등으로 다른 직원의 연차 갱신이 막히면 오류 없이 0건 수정될 수 있으므로 반드시 확인
          const upRows = upRes.ok ? await upRes.json().catch(() => []) : [];
          if (!upRes.ok || !Array.isArray(upRows) || upRows.length === 0) {
            deductFailed = true;
          }
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
    if (deductFailed) {
      throw new Error("최종 승인은 처리되었으나 신청자의 연차 차감에 실패했습니다. 시스템 관리자에게 연차 수동 조정을 요청해 주세요.");
    }
  },

  async bulkUpdateAnnualLeave(totalDays, resetUsed = false) {
    const baseVal = Number(totalDays);
    const bodyData = resetUsed
      ? { base_annual_leave: baseVal, annual_total: baseVal, annual_used: 0, leave_adjustment: 0, leave_adjustment_year: new Date().getFullYear() }
      : { base_annual_leave: baseVal, annual_total: baseVal };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=not.is.null`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify(bodyData)
    });
    if (!res.ok) throw new Error("일괄 연차 부여에 실패했습니다.");
    await this.syncFromCloud();
  },

  async updateSingleUserLeave(userId, annualTotal, annualUsed) {
    const curYear = new Date().getFullYear();
    const baseVal = Number(annualTotal);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify({
        base_annual_leave: baseVal,
        annual_total: baseVal,
        annual_used: Number(annualUsed ?? 0),
        leave_adjustment_year: curYear
      })
    });
    if (!res.ok) throw new Error("연차 정보 수정에 실패했습니다.");
    await this.syncFromCloud();
  },

  // 관리자 전용: 선택한 재직자들에게 휴가 일수(+/-) 일괄 부여(leave_adjustment 누적 가산) 및 알림 전송
  async adminBulkGrantLeave(userIds, deltaDays, reason) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("휴가를 부여할 대상 직원을 선택해 주세요.");
    }
    const delta = Number(deltaDays);
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error("부여할 휴가 일수를 0이 아닌 숫자로 입력해 주세요.");
    }
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) {
      throw new Error("부여 사유를 입력해 주세요.");
    }

    const currentYear = new Date().getFullYear();
    const localDb = this.getData();
    const signStr = delta > 0 ? `+${delta}` : `${delta}`;

    for (const uid of userIds) {
      const target = (localDb.users || []).find(u => String(u.id) === String(uid));
      const prevYear = Number(target?.leave_adjustment_year ?? target?.leaveAdjustmentYear ?? 0);
      const prevAdj = (prevYear === currentYear)
        ? Number(target?.leave_adjustment ?? target?.leaveAdjustment ?? 0)
        : 0;
      const nextAdj = Number((prevAdj + delta).toFixed(1));
      const baseLeave = Number(target?.base_annual_leave ?? target?.baseAnnualLeave ?? target?.annualTotal ?? 15);

      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`, {
        method: "PATCH",
        headers: { ...this.getHeaders(true), "Prefer": "return=representation" },
        body: JSON.stringify({
          leave_adjustment: nextAdj,
          leave_adjustment_year: currentYear,
          annual_total: Number((baseLeave + nextAdj).toFixed(1))
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`일괄 휴가 부여 실패 (${res.status}: ${err.message || err.msg || res.statusText})`);
      }

      try {
        await this.sendNotification(
          uid,
          `🎁 관리자가 [${cleanReason}]로 휴가 ${signStr}일을 부여했습니다.`
        );
      } catch (e) {
        console.warn("일괄 휴가 부여 알림 발송 실패:", e);
      }
    }

    await this.syncFromCloud();
  },

  calculateUserLeaveSummary(profile, approvedLeaves, today = new Date()) {
    return calculateUserLeaveSummary(profile, approvedLeaves, today);
  },

  async updateMyProfile(userId, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...this.getHeaders(true), "Prefer": "return=representation" },
      body: JSON.stringify(fields)
    });
    if (!res.ok) throw new Error("내 정보 수정에 실패했습니다.");
    await this.syncFromCloud();
  },

  // 관리자 전용: 임직원 인사 정보(이름/부서/직급/연락처/권한/총연차) 직접 수정
  async adminUpdateUserProfile(userId, fields) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...this.getHeaders(true), "Prefer": "return=representation" },
      body: JSON.stringify(fields)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`직원 정보 수정 실패 (${res.status}: ${err.message || err.msg || res.statusText})`);
    }
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("직원 정보가 수정되지 않았습니다. Supabase profiles 테이블의 관리자 UPDATE RLS 정책을 확인해 주세요.");
    }
    const localDb = this.getData();
    if (Array.isArray(localDb.users) && typeof Auth !== "undefined" && typeof Auth.mapProfileToUser === "function") {
      const mapped = Auth.mapProfileToUser(rows[0]);
      const idx = localDb.users.findIndex(u => String(u.id) === String(userId));
      if (idx !== -1) localDb.users[idx] = { ...localDb.users[idx], ...mapped };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb));
    }
    await this.syncFromCloud();
    return rows[0];
  },

  // 관리자 전용: public.admin_delete_user RPC 호출로 profiles + auth.users 계정 일괄 영구 삭제
  async adminDeleteUser(targetUserId) {
    if (!targetUserId) throw new Error("삭제할 대상 직원 ID가 없습니다.");
    if (typeof Auth !== "undefined" && typeof Auth.refreshSessionIfNeeded === "function") {
      await Auth.refreshSessionIfNeeded();
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_delete_user`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify({ target_user_id: targetUserId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const serverMsg = err.message || err.msg || err.details || err.hint || err.error || res.statusText || "계정 영구 삭제에 실패했습니다.";
      throw new Error(serverMsg);
    }

    // 로컬 캐시(직원 목록·조직도)에서 즉시 제거 후 클라우드 동기화
    const localDb = this.getData();
    if (Array.isArray(localDb.users)) {
      localDb.users = localDb.users.filter(u => String(u.id) !== String(targetUserId));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb));
    }
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

  // ✅ 알림 1건 클릭 시 개별 읽음 처리
  async markNotificationRead(notifId) {
    if (!notifId) return;
    await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${notifId}`, {
      method: "PATCH",
      headers: this.getHeaders(true),
      body: JSON.stringify({ is_read: true })
    });
    await this.syncFromCloud();
  },

  // ===================================================================
  // 게시판 댓글 (public.board_comments) REST API 조회 / 등록 / 삭제
  // ===================================================================
  async fetchBoardComments(postId) {
    const pid = String(postId ?? "").trim();
    if (!pid) return [];

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/board_comments?post_id=eq.${encodeURIComponent(pid)}&select=*&order=created_at.asc`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "댓글 목록을 불러오지 못했습니다.");
    }
    const rows = await res.json().catch(() => []);
    const list = Array.isArray(rows) ? rows : [];

    // 로컬 캐시(목록 댓글 개수 표시용) 동기화
    const localDb = this.getData();
    const others = (localDb.boardComments || []).filter(c => String(c.post_id) !== pid);
    localDb.boardComments = [...others, ...list];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb));

    return list;
  },

  async createBoardComment(payload) {
    const body = {
      post_id: String(payload?.post_id ?? ""),
      author_id: String(payload?.author_id ?? ""),
      author_name: String(payload?.author_name ?? ""),
      author_dept: String(payload?.author_dept ?? ""),
      author_position: String(payload?.author_position ?? ""),
      content: String(payload?.content ?? "")
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/board_comments`, {
      method: "POST",
      headers: { ...this.getHeaders(true), "Prefer": "return=representation" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "댓글 등록에 실패했습니다.");
    }
    const created = await res.json().catch(() => []);
    return Array.isArray(created) ? created[0] : created;
  },

  async deleteBoardComment(commentId) {
    const cid = String(commentId ?? "").trim();
    if (!cid) throw new Error("삭제할 댓글 ID가 없습니다.");

    const res = await fetch(`${SUPABASE_URL}/rest/v1/board_comments?id=eq.${encodeURIComponent(cid)}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "댓글 삭제에 실패했습니다.");
    }

    const localDb = this.getData();
    if (Array.isArray(localDb.boardComments)) {
      localDb.boardComments = localDb.boardComments.filter(c => String(c.id) !== cid);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb));
    }
  },

  async deleteBoardCommentsByPostId(postId) {
    const pid = String(postId ?? "").trim();
    if (!pid) return;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/board_comments?post_id=eq.${encodeURIComponent(pid)}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });
    if (!res.ok) {
      console.warn("게시글 연관 댓글 정리 실패:", res.status);
    }

    const localDb = this.getData();
    if (Array.isArray(localDb.boardComments)) {
      localDb.boardComments = localDb.boardComments.filter(c => String(c.post_id) !== pid);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localDb));
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
    if (!raw) return getSeedData();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return getSeedData();
      ["users", "departments", "leaveRequests", "notices", "boardPosts", "notifications", "boardComments"].forEach(k => {
        if (!Array.isArray(parsed[k])) parsed[k] = [];
      });
      return parsed;
    } catch (e) {
      return getSeedData();
    }
  },

  saveData(newData) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    this.pushToCloud(newData);
  },

  setSessionUser() {}
};

setInterval(() => {
  StorageDB.syncFromCloud();
}, 5000);