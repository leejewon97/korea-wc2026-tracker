import type { MatchStatus } from './types.js';

const FINISHED_STATUSES: MatchStatus[] = ['FT', 'AET', 'PEN', 'MANUAL'];

export function isFinishedStatus(status: MatchStatus): boolean {
  return FINISHED_STATUSES.includes(status);
}

/**
 * FIFA 표기 기준 홈/어웨이 스코어로 6개 추적 경기별 필요 결과를 판정한다.
 * 경기 미종료 시 null.
 */
export function evaluateCondition(
  matchId: number,
  homeScore: number | null,
  awayScore: number | null,
  status: MatchStatus,
): boolean | null {
  if (homeScore === null || awayScore === null) return null;
  if (!isFinishedStatus(status)) return null;

  switch (matchId) {
    case 1: {
      // 세네갈(홈) 1골차 이하 승 또는 이라크(어웨이) 4골차 이하 승
      if (homeScore > awayScore) return homeScore - awayScore <= 1;
      if (awayScore > homeScore) return awayScore - homeScore <= 4;
      return false;
    }
    case 2:
      // 스페인(어웨이) 승
      return awayScore > homeScore;
    case 3:
      // 이집트(홈) 승
      return homeScore > awayScore;
    case 4:
      // 가나(어웨이) 승
      return awayScore > homeScore;
    case 5:
      // 콩고민주(홈) 무승부 또는 패배
      return homeScore <= awayScore;
    case 6: {
      // 오스트리아(어웨이) 승 또는 알제리(홈) 2골차 이상 승
      if (awayScore > homeScore) return true;
      if (homeScore > awayScore) return homeScore - awayScore >= 2;
      return false;
    }
    default:
      return null;
  }
}

export function countMetConditions(
  results: Array<{ matchId: number; conditionMet: boolean | null }>,
): number {
  return results.filter((r) => r.conditionMet === true).length;
}

export function computeOnTrack(
  metCount: number,
  finishedCount: number,
  total: number,
  required: number,
): boolean | null {
  if (finishedCount < total) return null;
  return metCount >= required;
}
