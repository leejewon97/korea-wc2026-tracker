import type { StatusResponse } from '../shared/types';

const summaryEl = document.getElementById('summary')!;
const matchesEl = document.getElementById('matches')!;
const updatedAtEl = document.getElementById('updated-at')!;

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

loadStatus();
setInterval(loadStatus, 60_000);
