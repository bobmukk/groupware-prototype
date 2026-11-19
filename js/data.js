/**
 * js/data.js
 * 초기(빈) 데이터 구조.
 * 사용자/휴가/알림 등 실제 데이터는 Supabase(profiles, leave_requests, notifications, app_state)에서
 * 로그인 후 동기화되며, 이 파일에는 테스트 계정이나 개인정보를 포함하지 않습니다.
 */
const INITIAL_SEED_DATA = {
  users: [],
  departments: [],
  leaveRequests: [],
  notices: [],
  boardPosts: [],
  notifications: []
};
