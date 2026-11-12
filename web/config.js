/* 딜 데스크 설정
 * API_URL: 구글 Apps Script 웹 앱 주소(…/exec). 비워 두면 이 브라우저 안에서만 도는 시험 모드. */
window.DD_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx2tDpUcKy5VWdniQGq0qFe89mC24uqsWOTqNKKivYsm4-rKoyG610ButUd8nE_woHQ/exec',
  TEAM: '대체투자금융1본부2팀',   // 회사 이름 없이 (메일에선 '{회사} {부서}' 로 붙는다)
  COMPANY: '미래에셋증권',
  // 메일 서명 - 팀 공통 (사람마다 이름·부서·직함·전화만 바뀐다)
  ADDRESS: '(04539) 서울특별시 중구 을지로5길 26, 동관 26층(미래에셋센터원빌딩)',
  FAX_PREFIX: '0505 085',         // 팩스 = 이 앞자리 + 회사 전화 끝 네 자리 (따로 적으면 그 값)
};
