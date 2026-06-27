import { recordPageVisit } from './record-visit';

const statusEl = document.getElementById('go-status')!;
const openKakaoEl = document.getElementById('open-kakao') as HTMLAnchorElement;
const openWebEl = document.getElementById('open-web') as HTMLAnchorElement;

const params = new URLSearchParams(window.location.search);
const met = params.get('met');
const finished = params.get('finished');
const required = params.get('required') ?? '3';
const onTrack = params.get('onTrack');
const milestone = params.get('milestone');

if (met !== null && finished !== null) {
  let line = `현황: ${met}/${required} 충족 (종료 ${finished}/6)`;
  if (milestone === 'advance_confirmed') line += ' — 32강 진출 확정';
  else if (milestone === 'eliminated_confirmed') line += ' — 탈락 확정';
  else if (onTrack === '1') line += ' — 32강 진출 조건 충족';
  else if (onTrack === '0') line += ' — 진출 조건 미충족';
  statusEl.textContent = line;
} else {
  statusEl.textContent = '상세 현황은 카카오톡 나와의 채팅 또는 웹 대시보드에서 확인하세요.';
}

openKakaoEl.href = 'kakaotalk://launch';
openWebEl.href = '/';

recordPageVisit();
