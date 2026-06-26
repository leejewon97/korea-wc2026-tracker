import {
  getAllPushSubscriptions,
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
  buildGoUrl,
  buildMemoTemplate,
  buildPayloadSummary,
  buildPushTitle,
} from './notification-message.js';
import { hasPushConfig, sendPushToSubscription } from './push.js';
import { buildStatusResponse } from './status.js';
import { decryptToken, encryptToken } from './token-crypto.js';
import { unsubscribeUser } from './unsubscribe-user.js';
import { detectMilestone } from '../../shared/conditions.js';

export async function onMatchFinished(matchId: number): Promise<void> {
  if (!hasKakaoConfig() && !hasPushConfig()) return;

  const status = buildStatusResponse();
  const hash = computeNotificationHash(status);
  const lastHash = getAppMeta(LAST_NOTIFICATION_HASH_KEY);

  if (lastHash === hash) {
    console.log('[notifier] skipped — same notification hash');
    return;
  }

  const users = hasKakaoConfig() ? getAllUsers() : [];
  const pushSubs = hasPushConfig() ? getAllPushSubscriptions() : [];

  if (users.length === 0 && pushSubs.length === 0) {
    setAppMeta(LAST_NOTIFICATION_HASH_KEY, hash);
    console.log('[notifier] no subscribers — hash saved');
    return;
  }

  const template = buildMemoTemplate(status, matchId);
  const memoSummary = buildPayloadSummary(status, matchId);
  const pushTitle = buildPushTitle(status, matchId);
  const pushUrl = buildGoUrl(status);
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
        payloadSummary: memoSummary,
        success: true,
      });
      successCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      insertNotificationLog({
        userId: user.id,
        channel: 'kakao_memo',
        notificationHash: hash,
        payloadSummary: memoSummary,
        success: false,
        errorMessage: message,
      });
      console.error(`[notifier] user ${user.id} memo failed:`, message);
    }
  }

  for (const sub of pushSubs) {
    try {
      await sendPushToSubscription(sub, { title: pushTitle, url: pushUrl });
      insertNotificationLog({
        userId: sub.user_id,
        channel: 'web_push',
        notificationHash: hash,
        payloadSummary: pushTitle,
        success: true,
      });
      successCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      insertNotificationLog({
        userId: sub.user_id,
        channel: 'web_push',
        notificationHash: hash,
        payloadSummary: pushTitle,
        success: false,
        errorMessage: message,
      });
      console.error(
        `[notifier] push sub ${sub.id} (user ${sub.user_id}) failed:`,
        message,
      );
    }
  }

  const milestone = detectMilestone(
    status.metCount,
    status.finishedCount,
    status.matches.length,
    status.requiredMetCount,
  );

  if (milestone || successCount > 0) {
    setAppMeta(LAST_NOTIFICATION_HASH_KEY, hash);
  }

  if (successCount > 0) {
    console.log(
      `[notifier] sent ${successCount} notification(s) (users=${users.length}, push=${pushSubs.length})`,
    );
  } else if (!milestone) {
    console.warn('[notifier] all sends failed — hash not updated');
  }

  if (!milestone || users.length === 0) return;

  for (const user of users) {
    try {
      const removed = await unsubscribeUser(user);
      if (removed) {
        console.log(
          `[notifier] auto-unsubscribed user ${user.id} after ${milestone}`,
        );
      }
    } catch (err) {
      console.error(
        `[notifier] auto-unsubscribe failed for user ${user.id}:`,
        err,
      );
    }
  }
}
