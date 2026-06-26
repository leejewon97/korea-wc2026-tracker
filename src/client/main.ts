import type { StatusResponse } from '../shared/types';

const summaryEl = document.getElementById('summary')!;
const matchesEl = document.getElementById('matches')!;
const updatedAtEl = document.getElementById('updated-at')!;
const subscribeEl = document.getElementById('subscribe')!;

interface AuthMeResponse {
  subscribed: boolean;
  kakaoEnabled: boolean;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: '카카오 동의가 취소되었습니다.',
  invalid_state:
    '로그인 연결이 끊겼습니다. 브라우저에서 다시 시도해 주세요. (인앱 브라우저는 Safari·Chrome 사용 권장)',
  login_failed: '카카오 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  not_configured: '카카오 알림이 아직 설정되지 않았습니다.',
};

function showAuthBanner(
  message: string,
  type: 'ok' | 'error' | 'info',
): void {
  const banner = document.createElement('div');
  banner.className = `auth-banner auth-banner-${type}`;
  banner.setAttribute('role', 'status');
  banner.textContent = message;
  subscribeEl.prepend(banner);
  window.setTimeout(() => banner.remove(), 10_000);
}

function renderSubscribe(auth: AuthMeResponse): void {
  if (!auth.kakaoEnabled) {
    subscribeEl.innerHTML = '';
    subscribeEl.hidden = true;
    return;
  }

  subscribeEl.hidden = false;

  if (auth.subscribed) {
    subscribeEl.innerHTML = `
      <div class="subscribe-card subscribed">
        <div class="subscribe-top">
          <span class="subscribe-badge">알림 구독 중</span>
        </div>
        <p class="subscribe-hint">경기 종료 시 카카오톡 <strong>나와의 채팅</strong>에 현황이 메모됩니다. (카카오톡 푸시 없음)</p>
        <button type="button" class="btn btn-ghost" id="unsubscribe-btn">구독 해지</button>
      </div>
    `;
    document.getElementById('unsubscribe-btn')?.addEventListener('click', () => {
      void unsubscribe();
    });
    return;
  }

  subscribeEl.innerHTML = `
    <div class="subscribe-card">
      <p class="subscribe-lead">경기 종료·진출 현황을 카카오톡 나와의 채팅으로 받아보세요.</p>
      <button type="button" class="btn btn-kakao" id="subscribe-btn">카카오로 알림 받기</button>
      <p class="subscribe-hint">나와의 채팅에 메모됩니다. 카카오톡 앱 푸시는 오지 않습니다.</p>
    </div>
  `;
  document.getElementById('subscribe-btn')?.addEventListener('click', () => {
    window.location.assign('/api/auth/kakao');
  });
}

async function loadAuth(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as AuthMeResponse;
    renderSubscribe(data);
  } catch (err) {
    subscribeEl.innerHTML =
      '<div class="subscribe-card">구독 상태를 불러오지 못했습니다.</div>';
    console.error(err);
  }
}

async function unsubscribe(): Promise<void> {
  const res = await fetch('/api/auth/unsubscribe', {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    alert('구독 해지에 실패했습니다.');
    return;
  }
  await loadAuth();
  showAuthBanner(
    '카카오 알림 구독이 해지되었습니다. 다시 구독하려면 카카오 동의가 필요합니다.',
    'info',
  );
}

function formatKickoff(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  return `마지막 갱신: ${date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
}

function statusLabel(status: StatusResponse['matches'][0]['status']): string {
  switch (status) {
    case 'NS':
      return '예정';
    case 'LIVE':
      return '진행 중';
    case 'FT':
    case 'AET':
    case 'PEN':
    case 'MANUAL':
      return '종료';
    default:
      return status;
  }
}

function renderSummary(data: StatusResponse): void {
  const { metCount, requiredMetCount, finishedCount, onTrack } = data;
  const progress = Math.min(100, (metCount / requiredMetCount) * 100);

  let badgeClass = 'pending';
  let badgeText = '경기 진행 중';

  if (onTrack === true) {
    badgeClass = 'ok';
    badgeText = '32강 진출 조건 충족';
  } else if (onTrack === false) {
    badgeClass = 'bad';
    badgeText = '진출 조건 미충족';
  }

  summaryEl.innerHTML = `
    <div class="summary-card">
      <div class="summary-top">
        <div class="summary-count">${metCount}<span> / ${requiredMetCount}</span></div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <p class="match-meta">종료 ${finishedCount} / ${data.matches.length}경기</p>
      <div class="progress-bar" aria-hidden="true">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
    </div>
  `;
}

function renderMatches(data: StatusResponse): void {
  matchesEl.innerHTML = data.matches
    .map((match) => {
      const finished = ['FT', 'AET', 'PEN', 'MANUAL'].includes(match.status);
      const score =
        match.homeScore !== null && match.awayScore !== null
          ? `${match.homeScore} : ${match.awayScore}`
          : '—';

      let cardClass = '';
      let resultClass = 'waiting';
      let resultText = '대기 중';

      if (match.pollFailed && !finished) {
        cardClass = 'poll-failed';
        resultClass = 'poll-failed';
        resultText = '조회 실패';
      } else if (finished && match.conditionMet === true) {
        cardClass = 'met';
        resultClass = 'met';
        resultText = '✓ 필요 결과';
      } else if (finished && match.conditionMet === false) {
        cardClass = 'failed';
        resultClass = 'failed';
        resultText = '✗ 조건 불충족';
      }

      const pollHint =
        match.pollFailed && !finished
          ? '<p class="admin-hint"><a href="/admin">스코어를 직접 입력하세요</a></p>'
          : '';

      return `
        <article class="match-card ${cardClass}">
          <div class="match-header">
            <div>
              <h2 class="match-title">${match.label}</h2>
              <p class="match-meta">${match.group}조 · ${formatKickoff(match.kickoffKst)} · ${statusLabel(match.status)}</p>
            </div>
            <div class="match-score ${finished ? '' : 'pending'}">${score}</div>
          </div>
          <p class="requirement">필요: ${match.requirement}</p>
          <span class="result-pill ${resultClass}">${resultText}</span>
          ${pollHint}
        </article>
      `;
    })
    .join('');
}

async function loadStatus(): Promise<void> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as StatusResponse;
    renderSummary(data);
    renderMatches(data);
    updatedAtEl.textContent = formatUpdatedAt(data.updatedAt);
  } catch (err) {
    summaryEl.innerHTML =
      '<div class="summary-card">상태를 불러오지 못했습니다. 서버가 실행 중인지 확인하세요.</div>';
    console.error(err);
  }
}

async function initAuth(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('auth_error');
  const subscribed = params.get('subscribed');

  if (authError || subscribed) {
    window.history.replaceState({}, '', '/');
  }

  await loadAuth();

  if (authError) {
    showAuthBanner(
      AUTH_ERROR_MESSAGES[authError] ??
        '카카오 로그인에 실패했습니다. 다시 시도해 주세요.',
      'error',
    );
    return;
  }

  if (subscribed === '1') {
    const isSubscribed = Boolean(document.querySelector('.subscribe-badge'));
    showAuthBanner(
      isSubscribed
        ? '카카오 알림 구독이 완료되었습니다.'
        : '구독은 처리됐지만 이 브라우저에 로그인이 유지되지 않았습니다. Safari·Chrome에서 다시 시도해 주세요.',
      isSubscribed ? 'ok' : 'error',
    );
  }
}

void initAuth();
loadStatus();
setInterval(loadStatus, 60_000);
