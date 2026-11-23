/**
 * js/modules/attendance.js
 * 근태관리 독립 모듈 (출퇴근, 주말/공휴일/휴가 연동, 사내 공인 IP 체크, 외근 모드, 관리자 수정/삭제, 엑셀 다운로드)
 */
const AttendanceModule = (() => {
  // 2026~2027 대한민국 법정 공휴일 (대체공휴일 포함)
  const HOLIDAYS = {
    "2026-01-01": "신정",
    "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
    "2026-03-01": "삼일절", "2026-03-02": "삼일절 대체공휴일",
    "2026-05-05": "어린이날", "2026-05-24": "부처님오신날", "2026-05-25": "부처님오신날 대체공휴일",
    "2026-06-03": "지방선거일", "2026-06-06": "현충일",
    "2026-08-15": "광복절", "2026-08-17": "광복절 대체공휴일",
    "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴",
    "2026-10-03": "개천절", "2026-10-05": "개천절 대체공휴일",
    "2026-10-09": "한글날", "2026-12-25": "성탄절",
    "2027-01-01": "신정",
    "2027-02-06": "설날 연휴", "2027-02-07": "설날", "2027-02-08": "설날 연휴", "2027-02-09": "설날 대체공휴일",
    "2027-03-01": "삼일절", "2027-05-05": "어린이날", "2027-05-13": "부처님오신날",
    "2027-06-06": "현충일", "2027-08-15": "광복절", "2027-08-16": "광복절 대체공휴일",
    "2027-09-14": "추석 연휴", "2027-09-15": "추석", "2027-09-16": "추석 연휴",
    "2027-10-03": "개천절", "2027-10-04": "개천절 대체공휴일",
    "2027-10-09": "한글날", "2027-10-11": "한글날 대체공휴일",
    "2027-12-25": "성탄절", "2027-12-27": "성탄절 대체공휴일"
  };

  let state = {
    currentIp: "",
    allowedIps: [],
    todayRecord: null,
    monthlyRecords: [],
    selectedMonth: "",
    selectedUserId: "ALL",
    bypassHolidayForTest: false,
    lastContainerId: null
  };

  const isLocalHost = () =>
    ["127.0.0.1", "localhost"].includes(window.location.hostname);

  const escapeHtml = (str = "") =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const getTodayKST = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  const getMonthKST = () => getTodayKST().slice(0, 7);

  const formatTimeKST = (isoStr) => {
    if (!isoStr) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(isoStr));
  };

  const formatTimeForInput = (isoStr) => {
    if (!isoStr) return "";
    return formatTimeKST(isoStr);
  };

  const isAdminUser = (user) => {
    if (!user) return false;
    const role = String(user.role || "").toUpperCase();
    return role === "ADMIN" || user.isAdmin === true || String(user.position || "").includes("대표");
  };

  const getHolidayInfo = (ymd) => {
    if (HOLIDAYS[ymd]) return { isOff: true, label: HOLIDAYS[ymd] };
    const [y, m, d] = ymd.split("-").map(Number);
    const day = new Date(y, m - 1, d).getDay();
    if (day === 0) return { isOff: true, label: "일요일 (휴무)" };
    if (day === 6) return { isOff: true, label: "토요일 (휴무)" };
    return { isOff: false, label: "" };
  };

  const getTodayLeaveInfo = (userId, ymd) => {
    const db = typeof StorageDB !== "undefined" ? StorageDB.getData() : { leaveRequests: [] };
    const leaves = db.leaveRequests || [];
    const matched = leaves.find(lv =>
      String(lv.applicantId) === String(userId) &&
      lv.status === "APPROVED" &&
      String(lv.startDate).slice(0, 10) <= ymd &&
      String(lv.endDate).slice(0, 10) >= ymd
    );
    if (!matched) return null;
    const isHalfDay = String(matched.leaveType || "").includes("반차") || Number(matched.days) < 1;
    return {
      leaveType: matched.leaveType || "휴가",
      isFullDay: !isHalfDay
    };
  };

  async function fetchCurrentIP() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        state.currentIp = data.ip || "";
      }
    } catch {
      state.currentIp = "";
    }
    return state.currentIp;
  }

  async function fetchSettings() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_settings?id=eq.default&select=*`, {
      headers: StorageDB.getHeaders()
    });
    if (res.ok) {
      const rows = await res.json();
      state.allowedIps = Array.isArray(rows?.[0]?.allowed_ips) ? rows[0].allowed_ips : [];
    }
  }

  async function saveAllowedIps(ipArray) {
    const cleaned = [...new Set(ipArray.map(s => s.trim()).filter(Boolean))];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance_settings?id=eq.default`, {
      method: "PATCH",
      headers: { ...StorageDB.getHeaders(true), Prefer: "return=representation" },
      body: JSON.stringify({ allowed_ips: cleaned, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("사내 IP 저장에 실패했습니다.");
    state.allowedIps = cleaned;
  }

  async function fetchTodayRecord(userId, ymd) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/attendance?user_id=eq.${userId}&work_date=eq.${ymd}&select=*`,
      { headers: StorageDB.getHeaders() }
    );
    if (res.ok) {
      const rows = await res.json();
      state.todayRecord = rows?.[0] || null;
    }
  }

  async function fetchMonthlyRecords(monthStr) {
    const [y, m] = monthStr.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${monthStr}-01`;
    const end = `${monthStr}-${String(lastDay).padStart(2, "0")}`;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/attendance?work_date=gte.${start}&work_date=lte.${end}&select=*&order=work_date.desc,clock_in.asc`,
      { headers: StorageDB.getHeaders() }
    );
    if (res.ok) {
      state.monthlyRecords = await res.json();
    }
  }

  async function handleClockIn(workType = "내근") {
    const user = Auth.getCurrentUser();
    if (!user) return alert("로그인이 필요합니다.");

    let note = "";
    if (workType === "외근") {
      note = prompt("외근/외부미팅 방문지 및 사유를 입력해 주세요.\n(예: 국회도서관 미팅 직출)");
      if (note === null) return;
      if (!note.trim()) return alert("외근 사유를 입력해야 출근 처리됩니다.");
    }

    const ymd = getTodayKST();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance`, {
        method: "POST",
        headers: { ...StorageDB.getHeaders(true), Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: user.id,
          work_date: ymd,
          work_type: workType,
          note: note.trim(),
          clock_in_ip: state.currentIp
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (String(err.code) === "23505") {
          alert("이미 오늘 출근 처리가 완료되었습니다.");
        } else {
          throw new Error(err.message || "출근 처리에 실패했습니다.");
        }
      }
      await refreshCurrentView();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleClockOut(isExternal = false) {
    const user = Auth.getCurrentUser();
    if (!user) return;

    let note = "";
    if (isExternal) {
      note = prompt("사외(외근/직퇴) 퇴근 사유를 입력해 주세요.\n(예: 외부 미팅 후 직퇴)");
      if (note === null) return;
      if (!note.trim()) return alert("직퇴/외근 퇴근 사유를 입력해 주세요.");
    } else {
      if (!confirm("퇴근 처리하시겠습니까? (오늘 퇴근 후에는 재출근할 수 없습니다.)")) return;
    }

    const ymd = getTodayKST();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/attendance_clock_out`, {
        method: "POST",
        headers: StorageDB.getHeaders(true),
        body: JSON.stringify({
          p_user_id: user.id,
          p_work_date: ymd,
          p_note: note.trim() || null,
          p_ip: state.currentIp || null
        })
      });
      if (!res.ok) throw new Error("퇴근 처리에 실패했습니다.");
      await refreshCurrentView();
    } catch (e) {
      alert(e.message);
    }
  }

  // 관리자 전용: 근태 기록 수정 모달 열기
  function openEditModal(recordId) {
    const user = Auth.getCurrentUser();
    if (!isAdminUser(user)) return alert("관리자만 수정할 수 있습니다.");

    const rec = state.monthlyRecords.find(r => String(r.id) === String(recordId));
    if (!rec) return alert("해당 기록을 찾을 수 없습니다.");

    const db = StorageDB.getData();
    const targetUser = (db.users || []).find(u => String(u.id) === String(rec.user_id)) || {};

    closeEditModal();
    const modal = document.createElement("div");
    modal.id = "att-edit-modal";
    modal.className = "att-modal-backdrop";
    modal.innerHTML = `
      <div class="att-modal-box">
        <h3 style="margin:0 0 12px; font-size:16px;">✏️ 근태 기록 수정</h3>
        <p style="margin:0 0 14px; font-size:13px; color:#64748b;">
          <strong>${escapeHtml(targetUser.name || "알 수 없음")}</strong> · ${escapeHtml(rec.work_date)}
        </p>
        <div class="att-form-row">
          <label>근무 구분</label>
          <select id="att-edit-type">
            <option value="내근" ${rec.work_type === "내근" ? "selected" : ""}>내근</option>
            <option value="외근" ${rec.work_type === "외근" ? "selected" : ""}>외근</option>
          </select>
        </div>
        <div class="att-form-row">
          <label>출근 시간</label>
          <input type="time" id="att-edit-in" value="${formatTimeForInput(rec.clock_in)}" required />
        </div>
        <div class="att-form-row">
          <label>퇴근 시간 (비워두면 미퇴근 처리)</label>
          <input type="time" id="att-edit-out" value="${formatTimeForInput(rec.clock_out)}" />
        </div>
        <div class="att-form-row">
          <label>비고 (사유)</label>
          <input type="text" id="att-edit-note" value="${escapeHtml(rec.note || "")}" placeholder="수정 사유 또는 외근 메모" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
          <button class="att-btn" onclick="AttendanceModule._closeEditModal()">취소</button>
          <button class="att-btn att-btn-in" onclick="AttendanceModule._saveEditRecord(${rec.id}, '${rec.work_date}')">저장</button>
        </div>
      </div>
    `;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeEditModal();
    });
    document.body.appendChild(modal);
  }

  function closeEditModal() {
    const existing = document.getElementById("att-edit-modal");
    if (existing) existing.remove();
  }

  // 관리자 전용: 수정 내용 DB 저장
  async function saveEditRecord(recordId, workDate) {
    const user = Auth.getCurrentUser();
    if (!isAdminUser(user)) return alert("관리자만 수정할 수 있습니다.");

    const workType = document.getElementById("att-edit-type")?.value || "내근";
    const inTime = document.getElementById("att-edit-in")?.value;
    const outTime = document.getElementById("att-edit-out")?.value;
    const note = document.getElementById("att-edit-note")?.value || "";

    if (!inTime) return alert("출근 시간은 필수입니다.");

    const payload = {
      work_type: workType,
      clock_in: `${workDate}T${inTime}:00+09:00`,
      clock_out: outTime ? `${workDate}T${outTime}:00+09:00` : null,
      note: note.trim()
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance?id=eq.${recordId}`, {
        method: "PATCH",
        headers: { ...StorageDB.getHeaders(true), Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("근태 기록 수정에 실패했습니다.");
      closeEditModal();
      await refreshCurrentView();
    } catch (e) {
      alert(e.message);
    }
  }

  // 관리자 전용: 근태 기록 삭제
  async function deleteRecord(recordId) {
    const user = Auth.getCurrentUser();
    if (!isAdminUser(user)) return alert("관리자만 삭제할 수 있습니다.");
    if (!confirm("이 근태 기록을 정말 삭제하시겠습니까?\n(삭제 후 복구할 수 없습니다.)")) return;

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/attendance?id=eq.${recordId}`, {
        method: "DELETE",
        headers: StorageDB.getHeaders(true)
      });
      if (!res.ok) throw new Error("근태 기록 삭제에 실패했습니다.");
      await refreshCurrentView();
    } catch (e) {
      alert(e.message);
    }
  }

  function checkOfficeNetwork() {
    if (!state.allowedIps.length) {
      return { allowed: true, notConfigured: true };
    }
    return {
      allowed: state.allowedIps.includes(state.currentIp),
      notConfigured: false
    };
  }

  function exportExcel() {
    const db = StorageDB.getData();
    const userMap = new Map((db.users || []).map(u => [String(u.id), u]));

    const filtered = state.monthlyRecords.filter(r =>
      state.selectedUserId === "ALL" || String(r.user_id) === String(state.selectedUserId)
    );

    if (filtered.length === 0) {
      return alert("다운로드할 근태 기록이 없습니다.");
    }

    const rows = filtered.map(r => {
      const u = userMap.get(String(r.user_id)) || {};
      return {
        "날짜": r.work_date,
        "직원명": u.name || "알 수 없음",
        "부서": u.dept || "-",
        "직급": u.position || "-",
        "근무구분": r.work_type || "내근",
        "출근시간": formatTimeKST(r.clock_in),
        "퇴근시간": formatTimeKST(r.clock_out),
        "비고": r.note || ""
      };
    });

    const fileName = `근태기록_${state.selectedMonth}`;

    if (typeof XLSX !== "undefined") {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "근태기록");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map(row => headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function buildActionCardHTML(user) {
    const ymd = getTodayKST();
    const holiday = getHolidayInfo(ymd);
    const leave = getTodayLeaveInfo(user.id, ymd);
    const net = checkOfficeNetwork();
    const rec = state.todayRecord;

    const isOffDay = holiday.isOff && !state.bypassHolidayForTest;
    const isFullLeave = leave && leave.isFullDay;

    let badgeText = "출근 전";
    let badgeColor = "#64748b";
    let subText = `오늘 날짜: ${ymd}`;
    let buttonsHTML = "";

    if (isOffDay) {
      badgeText = holiday.label;
      badgeColor = "#94a3b8";
      subText = "주말 및 공휴일에는 출퇴근 버튼이 비활성화됩니다.";
      buttonsHTML = `
        <button class="att-btn" disabled>출근하기</button>
        <button class="att-btn" disabled>퇴근하기</button>
      `;
    } else if (isFullLeave) {
      badgeText = `휴가 중 (${leave.leaveType})`;
      badgeColor = "#8b5cf6";
      subText = "승인된 휴가 일정이 등록되어 출퇴근이 비활성화되었습니다.";
      buttonsHTML = `
        <button class="att-btn" disabled>휴가 중</button>
        <button class="att-btn" disabled>퇴근하기</button>
      `;
    } else if (!rec) {
      const halfBadge = leave && !leave.isFullDay ? ` · 🏷️ ${leave.leaveType}` : "";
      if (net.allowed) {
        badgeText = "출근 전" + halfBadge;
        badgeColor = "#2563eb";
        subText = net.notConfigured
          ? `현재 IP: ${state.currentIp || "확인불가"} (사내 IP 미등록 — 테스트 허용 중)`
          : `사내 네트워크 확인됨 (${state.currentIp})`;
        buttonsHTML = `
          <button class="att-btn att-btn-in" onclick="AttendanceModule._clockIn('내근')">출근하기</button>
          <button class="att-btn att-btn-sub" onclick="AttendanceModule._clockIn('외근')">외근/미팅 출근</button>
          <button class="att-btn" disabled>퇴근하기</button>
        `;
      } else {
        badgeText = "사외 접속 중" + halfBadge;
        badgeColor = "#f59e0b";
        subText = `현재 IP(${state.currentIp || "확인불가"})는 사내 네트워크가 아닙니다. 외근/직출 시 아래 버튼을 이용하세요.`;
        buttonsHTML = `
          <button class="att-btn" disabled title="사내 네트워크 접속 시 활성화">출근하기 (사내 전용)</button>
          <button class="att-btn att-btn-outwork" onclick="AttendanceModule._clockIn('외근')">외근/직출 출근</button>
          <button class="att-btn" disabled>퇴근하기</button>
        `;
      }
    } else if (rec && !rec.clock_out) {
      badgeText = `근무 중 (${rec.work_type})`;
      badgeColor = "#16a34a";
      subText = `출근 시각: <strong>${formatTimeKST(rec.clock_in)}</strong>${rec.note ? ` · 비고: ${escapeHtml(rec.note)}` : ""}`;
      if (net.allowed) {
        buttonsHTML = `
          <button class="att-btn" disabled>출근 완료 (${formatTimeKST(rec.clock_in)})</button>
          <button class="att-btn att-btn-out" onclick="AttendanceModule._clockOut(false)">퇴근하기</button>
        `;
      } else {
        buttonsHTML = `
          <button class="att-btn" disabled>출근 완료 (${formatTimeKST(rec.clock_in)})</button>
          <button class="att-btn att-btn-outwork" onclick="AttendanceModule._clockOut(true)">외근/직퇴 퇴근</button>
        `;
      }
    } else {
      badgeText = "퇴근 완료";
      badgeColor = "#0f172a";
      subText = `출근 <strong>${formatTimeKST(rec.clock_in)}</strong> ~ 퇴근 <strong>${formatTimeKST(rec.clock_out)}</strong> (${rec.work_type})`;
      buttonsHTML = `
        <button class="att-btn" disabled>출근 (${formatTimeKST(rec.clock_in)})</button>
        <button class="att-btn" disabled>퇴근 (${formatTimeKST(rec.clock_out)})</button>
      `;
    }

    const localTestToggle = isLocalHost()
      ? `<label style="font-size:12px; color:#64748b; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
           <input type="checkbox" ${state.bypassHolidayForTest ? "checked" : ""} onchange="AttendanceModule._toggleHolidayTest(this.checked)">
           🧪 로컬 테스트(휴일 잠금 해제)
         </label>`
      : "";

    return `
      <div class="att-card">
        <div class="att-card-head">
          <div>
            <span class="att-badge" style="background:${badgeColor};">${badgeText}</span>
            <h3 style="margin:6px 0 2px; font-size:16px;">${escapeHtml(user.name)} ${escapeHtml(user.position || "")}님의 오늘 근태</h3>
            <p style="margin:0; font-size:13px; color:#64748b;">${subText}</p>
          </div>
          ${localTestToggle}
        </div>
        <div class="att-btn-group">${buttonsHTML}</div>
      </div>
    `;
  }

  function injectStyles() {
    if (document.getElementById("att-module-styles")) return;
    const style = document.createElement("style");
    style.id = "att-module-styles";
    style.textContent = `
      .att-wrap { display:flex; flex-direction:column; gap:16px; }
      .att-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:18px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
      .att-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
      .att-badge { display:inline-block; padding:3px 10px; border-radius:999px; color:#fff; font-size:12px; font-weight:600; }
      .att-btn-group { display:flex; gap:10px; flex-wrap:wrap; }
      .att-btn { padding:10px 18px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; color:#475569; font-weight:600; font-size:14px; cursor:pointer; }
      .att-btn:disabled { opacity:0.55; cursor:not-allowed; }
      .att-btn-in { background:#2563eb; color:#fff; border-color:#2563eb; }
      .att-btn-out { background:#0f172a; color:#fff; border-color:#0f172a; }
      .att-btn-outwork { background:#f59e0b; color:#fff; border-color:#f59e0b; }
      .att-btn-sub { background:#fff; color:#2563eb; border-color:#2563eb; }
      .att-btn-sm { padding:4px 9px; font-size:12px; border-radius:6px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; }
      .att-btn-danger { border-color:#fca5a5; color:#dc2626; background:#fef2f2; }
      .att-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between; margin-bottom:12px; }
      .att-table { width:100%; border-collapse:collapse; font-size:13px; }
      .att-table th, .att-table td { padding:10px 12px; border-bottom:1px solid #e2e8f0; text-align:left; white-space:nowrap; }
      .att-table th { background:#f8fafc; font-weight:600; color:#334155; }
      .att-ip-box { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; }
      .att-modal-backdrop { position:fixed; inset:0; background:rgba(15,23,42,0.45); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px; }
      .att-modal-box { background:#fff; border-radius:12px; padding:20px; width:100%; max-width:380px; box-shadow:0 10px 25px rgba(0,0,0,0.18); }
      .att-form-row { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
      .att-form-row label { font-size:12px; font-weight:600; color:#475569; }
      .att-form-row input, .att-form-row select { padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; }
    `;
    document.head.appendChild(style);
  }

  async function renderPage(containerId) {
    injectStyles();
    state.lastContainerId = containerId;
    const el = document.getElementById(containerId);
    if (!el) return;

    const user = Auth.getCurrentUser();
    if (!user) {
      el.innerHTML = `<div class="att-card">로그인이 필요합니다.</div>`;
      return;
    }

    if (!state.selectedMonth) state.selectedMonth = getMonthKST();
    const admin = isAdminUser(user);
    if (!admin) state.selectedUserId = user.id;

    el.innerHTML = `<div class="att-card">근태 정보를 불러오는 중...</div>`;

    await Promise.all([
      fetchCurrentIP(),
      fetchSettings(),
      fetchTodayRecord(user.id, getTodayKST()),
      fetchMonthlyRecords(state.selectedMonth)
    ]);

    const db = StorageDB.getData();
    const users = db.users || [];
    const userMap = new Map(users.map(u => [String(u.id), u]));

    const filtered = state.monthlyRecords.filter(r =>
      state.selectedUserId === "ALL" || String(r.user_id) === String(state.selectedUserId)
    );

    const rowsHTML = filtered.length
      ? filtered.map(r => {
          const u = userMap.get(String(r.user_id)) || {};
          const adminActionTd = admin
            ? `<td>
                 <button class="att-btn-sm" onclick="AttendanceModule._openEditModal(${r.id})">수정</button>
                 <button class="att-btn-sm att-btn-danger" onclick="AttendanceModule._deleteRecord(${r.id})">삭제</button>
               </td>`
            : "";
          return `
            <tr>
              <td>${r.work_date}</td>
              <td><strong>${escapeHtml(u.name || "-")}</strong></td>
              <td>${escapeHtml(u.dept || "-")}</td>
              <td><span class="att-badge" style="background:${r.work_type === "외근" ? "#f59e0b" : "#3b82f6"};">${r.work_type}</span></td>
              <td>${formatTimeKST(r.clock_in)}</td>
              <td>${formatTimeKST(r.clock_out)}</td>
              <td style="white-space:normal;">${escapeHtml(r.note || "-")}</td>
              ${adminActionTd}
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="${admin ? 8 : 7}" style="text-align:center; color:#94a3b8; padding:24px;">조회된 근태 기록이 없습니다.</td></tr>`;

    const userFilterHTML = admin
      ? `<select id="att-user-filter" onchange="AttendanceModule._changeUser(this.value)" style="padding:7px 10px; border:1px solid #cbd5e1; border-radius:6px;">
           <option value="ALL" ${state.selectedUserId === "ALL" ? "selected" : ""}>전체 직원</option>
           ${users.map(u => `<option value="${u.id}" ${String(state.selectedUserId) === String(u.id) ? "selected" : ""}>${escapeHtml(u.name)} (${escapeHtml(u.dept || "-")})</option>`).join("")}
         </select>`
      : "";

    const adminIpBoxHTML = admin
      ? `<div class="att-card">
           <h4 style="margin:0 0 6px; font-size:14px;">🏢 사내 네트워크(공인 IP) 접근 제어 설정</h4>
           <p style="margin:0; font-size:12px; color:#64748b;">
             현재 접속 IP: <strong>${state.currentIp || "확인 불가"}</strong> |
             등록된 사내 IP: <strong>${state.allowedIps.length ? state.allowedIps.join(", ") : "없음 (전체 허용 중)"}</strong>
           </p>
           <div class="att-ip-box">
             <button class="att-btn att-btn-sub" onclick="AttendanceModule._registerCurrentIp()">현재 IP를 사내 IP로 추가</button>
             <button class="att-btn" onclick="AttendanceModule._clearAllowedIps()">사내 IP 제한 해제</button>
           </div>
         </div>`
      : "";

    el.innerHTML = `
      <div class="att-wrap">
        ${buildActionCardHTML(user)}
        ${adminIpBoxHTML}
        <div class="att-card">
          <div class="att-toolbar">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <h3 style="margin:0; font-size:16px;">📋 월별 근태 기록</h3>
              <input type="month" value="${state.selectedMonth}" onchange="AttendanceModule._changeMonth(this.value)" style="padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
              ${userFilterHTML}
            </div>
            <button class="att-btn att-btn-in" onclick="AttendanceModule.exportExcel()">📥 엑셀 다운로드 (.xlsx)</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="att-table">
              <thead>
                <tr>
                  <th>날짜</th><th>직원명</th><th>부서</th><th>구분</th><th>출근</th><th>퇴근</th><th>비고(외근사유)</th>${admin ? "<th>관리</th>" : ""}
                </tr>
              </thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async function renderWidget(containerId) {
    injectStyles();
    const el = document.getElementById(containerId);
    const user = Auth.getCurrentUser();
    if (!el || !user) return;
    await Promise.all([fetchCurrentIP(), fetchSettings(), fetchTodayRecord(user.id, getTodayKST())]);
    el.innerHTML = buildActionCardHTML(user);
  }

  async function refreshCurrentView() {
    if (state.lastContainerId && document.getElementById(state.lastContainerId)) {
      await renderPage(state.lastContainerId);
    }
    const widget = document.getElementById("dashboard-attendance-widget");
    if (widget) await renderWidget("dashboard-attendance-widget");
  }

  return {
    renderPage,
    renderWidget,
    exportExcel,
    _clockIn: handleClockIn,
    _clockOut: handleClockOut,
    _openEditModal: openEditModal,
    _closeEditModal: closeEditModal,
    _saveEditRecord: saveEditRecord,
    _deleteRecord: deleteRecord,
    _toggleHolidayTest: (checked) => { state.bypassHolidayForTest = checked; refreshCurrentView(); },
    _changeMonth: (m) => { state.selectedMonth = m; refreshCurrentView(); },
    _changeUser: (uid) => { state.selectedUserId = uid; refreshCurrentView(); },
    _registerCurrentIp: async () => {
      if (!state.currentIp) return alert("현재 IP를 확인할 수 없습니다.");
      await saveAllowedIps([...state.allowedIps, state.currentIp]);
      alert(`사내 IP(${state.currentIp})가 등록되었습니다.`);
      await refreshCurrentView();
    },
    _clearAllowedIps: async () => {
      if (!confirm("등록된 사내 IP를 모두 비우고 제한을 해제할까요?")) return;
      await saveAllowedIps([]);
      await refreshCurrentView();
    }
  };
})();