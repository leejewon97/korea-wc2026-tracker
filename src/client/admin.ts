import type { StatusResponse } from '../shared/types';

const matchSelect = document.getElementById('match-id') as HTMLSelectElement;
const homeInput = document.getElementById('home-score') as HTMLInputElement;
const awayInput = document.getElementById('away-score') as HTMLInputElement;
const secretInput = document.getElementById('secret') as HTMLInputElement;
const form = document.getElementById('admin-form') as HTMLFormElement;
const messageEl = document.getElementById('form-message')!;
const testSendBtn = document.getElementById('test-send-btn') as HTMLButtonElement;
const testMessageEl = document.getElementById('test-message')!;
const serverClockEl = document.getElementById('server-clock')!;

const KST = 'Asia/Seoul';
const SERVER_CLOCK_RESYNC_MS = 60_000;

let serverOffsetMs = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

function formatServerClock(date: Date): string {
  return date.toLocaleString('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function renderServerClock(): void {
  const serverNow = new Date(Date.now() + serverOffsetMs);
  serverClockEl.textContent = `${formatServerClock(serverNow)} KST`;
}

function syncServerClock(serverTime: string): void {
  serverOffsetMs = new Date(serverTime).getTime() - Date.now();
  renderServerClock();
}

function startServerClock(): void {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(renderServerClock, 1000);
}

async function loadMatches(): Promise<void> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as StatusResponse;

  syncServerClock(data.serverTime);
  startServerClock();

  matchSelect.innerHTML = data.matches
    .map(
      (m) =>
        `<option value="${m.id}">${m.label} (${m.homeTeamKo} vs ${m.awayTeamKo})</option>`,
    )
    .join('');
}

async function resyncServerClock(): Promise<void> {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = (await res.json()) as StatusResponse;
    syncServerClock(data.serverTime);
  } catch {
    // keep ticking with last offset
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageEl.textContent = '저장 중…';
  messageEl.className = 'form-message';

  try {
    const res = await fetch('/api/admin/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        matchId: Number(matchSelect.value),
        homeScore: Number(homeInput.value),
        awayScore: Number(awayInput.value),
        secret: secretInput.value,
      }),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string; conditionMet?: boolean };

    if (!res.ok) {
      messageEl.textContent = data.error ?? '저장 실패';
      messageEl.className = 'form-message error';
      return;
    }

    const met =
      data.conditionMet === true
        ? '필요 결과 충족'
        : data.conditionMet === false
          ? '조건 불충족'
          : '';
    messageEl.textContent = `저장되었습니다. ${met}`;
    messageEl.className = 'form-message ok';
    secretInput.value = '';
    void resyncServerClock();
  } catch (err) {
    messageEl.textContent = '요청 실패. 서버가 실행 중인지 확인하세요.';
    messageEl.className = 'form-message error';
    console.error(err);
  }
});

testSendBtn.addEventListener('click', async () => {
  if (!secretInput.value) {
    testMessageEl.textContent = '관리자 비밀번호를 입력하세요.';
    testMessageEl.className = 'form-message error';
    secretInput.focus();
    return;
  }

  testMessageEl.textContent = '테스트 발송 중…';
  testMessageEl.className = 'form-message';
  testSendBtn.disabled = true;

  try {
    const res = await fetch('/api/admin/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ secret: secretInput.value }),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      kakaoSent?: boolean;
      pushSent?: number;
      errors?: string[];
    };

    if (!res.ok) {
      testMessageEl.textContent = data.error ?? '테스트 발송 실패';
      testMessageEl.className = 'form-message error';
      return;
    }

    const parts: string[] = [];
    if (data.kakaoSent) parts.push('카카오 메모');
    if (data.pushSent && data.pushSent > 0) {
      parts.push(`Push ${data.pushSent}건`);
    }
    const warn =
      data.errors && data.errors.length > 0
        ? ` (일부 실패: ${data.errors.join('; ')})`
        : '';
    testMessageEl.textContent = `테스트 발송 완료: ${parts.join(', ') || '없음'}${warn}`;
    testMessageEl.className = 'form-message ok';
  } catch (err) {
    testMessageEl.textContent = '요청 실패. 서버가 실행 중인지 확인하세요.';
    testMessageEl.className = 'form-message error';
    console.error(err);
  } finally {
    testSendBtn.disabled = false;
  }
});

loadMatches().catch((err) => {
  serverClockEl.textContent = '서버 시각을 불러오지 못했습니다.';
  messageEl.textContent = '경기 목록을 불러오지 못했습니다.';
  messageEl.className = 'form-message error';
  console.error(err);
});

setInterval(() => {
  void resyncServerClock();
}, SERVER_CLOCK_RESYNC_MS);
