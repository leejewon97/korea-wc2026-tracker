import type { StatusResponse } from '../shared/types';

const matchSelect = document.getElementById('match-id') as HTMLSelectElement;
const homeInput = document.getElementById('home-score') as HTMLInputElement;
const awayInput = document.getElementById('away-score') as HTMLInputElement;
const secretInput = document.getElementById('secret') as HTMLInputElement;
const form = document.getElementById('admin-form') as HTMLFormElement;
const messageEl = document.getElementById('form-message')!;

async function loadMatches(): Promise<void> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as StatusResponse;

  matchSelect.innerHTML = data.matches
    .map(
      (m) =>
        `<option value="${m.id}">${m.label} (${m.homeTeamKo} vs ${m.awayTeamKo})</option>`,
    )
    .join('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageEl.textContent = '저장 중…';
  messageEl.className = 'form-message';

  try {
    const res = await fetch('/api/admin/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  } catch (err) {
    messageEl.textContent = '요청 실패. 서버가 실행 중인지 확인하세요.';
    messageEl.className = 'form-message error';
    console.error(err);
  }
});

loadMatches().catch((err) => {
  messageEl.textContent = '경기 목록을 불러오지 못했습니다.';
  messageEl.className = 'form-message error';
  console.error(err);
});
