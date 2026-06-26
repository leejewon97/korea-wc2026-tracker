import {
  deletePushSubscriptionsByUserId,
  deleteUser,
  getUserById,
  type UserRow,
} from '../db/index.js';
import { unlinkWithRefreshToken } from './kakao.js';
import { decryptToken } from './token-crypto.js';

export async function unsubscribeUser(user: UserRow): Promise<boolean> {
  try {
    const refreshToken = decryptToken(user.refresh_token_enc);
    await unlinkWithRefreshToken(refreshToken);
  } catch (err) {
    console.warn(
      `[unsubscribe] Kakao unlink failed for user ${user.id} (continuing):`,
      err,
    );
  }

  deletePushSubscriptionsByUserId(user.id);
  return deleteUser(user.id);
}

export async function unsubscribeUserById(userId: number): Promise<boolean> {
  const user = getUserById(userId);
  if (!user) return false;
  return unsubscribeUser(user);
}
