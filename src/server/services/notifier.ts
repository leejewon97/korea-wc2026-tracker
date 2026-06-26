import {
  getAllUsers,
  getAppMeta,
  insertNotificationLog,
  setAppMeta,
  upsertUser,
} from '../db/index.js';
import {
  hasKakaoConfig,
  refreshAccessToken,
  sendMemoToMe,
} from './kakao.js';
import {
  computeNotificationHash,
  LAST_NOTIFICATION_HASH_KEY,
} from './notification-hash.js';
import {
  buildMemoTemplate,
  buildPayloadSummary,
} from './notification-message.js';
import { buildStatusResponse } from './status.js';
import { decryptToken, encryptToken } from './token-crypto.js';

export async function onMatchFinished(matchId: number): Promise<void> {
  if (!hasKakaoConfig()) return;

  const status = buildStatusResponse();
  const hash = computeNotificationHash(status);
  const lastHash = getAppMeta(LAST_NOTIFICATION_HASH_KEY);

  if (lastHash === hash) {
    console.log('[notifier] skipped — same notification hash');
    return;
  }

  const users = getAllUsers();
  if (users.length === 0) {
    setAppMeta(LAST_NOTIFICATION_HASH_KEY, hash);
    console.log('[notifier] no subscribers — hash saved');
    return;
  }

  const template = buildMemoTemplate(status, matchId);
  const summary = buildPayloadSummary(status, matchId);
  let successCount = 0;

  for (const user of users) {
    try {
      let refreshToken = decryptToken(user.refresh_token_enc);
      const tokenRes = await refreshAccessToken(refreshToken);

      if (tokenRes.refresh_token) {
        refreshToken = tokenRes.refresh_token;
        upsertUser(user.kakao_user_id, encryptToken(refreshToken));
      }

      await sendMemoToMe(tokenRes.access_token, template);
      insertNotificationLog({
        userId: user.id,
        channel: 'kakao_memo',
        notificationHash: hash,
        payloadSummary: summary,
        success: true,
      });
      successCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      insertNotificationLog({
        userId: user.id,
        channel: 'kakao_memo',
        notificationHash: hash,
        payloadSummary: summary,
        success: false,
        errorMessage: message,
      });
      console.error(`[notifier] user ${user.id} memo failed:`, message);
    }
  }

  if (successCount > 0) {
    setAppMeta(LAST_NOTIFICATION_HASH_KEY, hash);
    console.log(
      `[notifier] sent memo to ${successCount}/${users.length} subscribers`,
    );
  } else {
    console.warn('[notifier] all memo sends failed — hash not updated');
  }
}
