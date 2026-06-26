export type PushEnvKind = 'supported' | 'in_app' | 'ios_needs_homescreen' | 'unsupported';

let cachedVapidPublicKey: string | null = null;
let preparePromise: Promise<void> | null = null;

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /KAKAOTALK|NAVER|Instagram|Line\//i.test(ua);
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Shown when Notification.permission === 'denied' (site or Chrome auto-block). */
export function pushPermissionBlockedHintHtml(): string {
  if (isAndroid()) {
    return `
      <ol class="env-hint push-unblock-steps">
        <li>주소창 오른쪽 <strong>⋮</strong> (점 3개) → 사이트 정보(<strong>ⓘ</strong>)</li>
        <li><strong>권한</strong> → <strong>알림</strong> → <strong>허용</strong></li>
        <li>또는 <strong>Chrome 설정 → 알림 → Chrome에서 상세설정</strong>에서 이 사이트가 <strong>자동으로 차단됨</strong>이면 해제</li>
        <li>설정을 바꾼 뒤 아래 <strong>푸시 알림 받기</strong>를 다시 눌러 주세요</li>
      </ol>
    `;
  }
  return `
    <p class="env-hint">주소창 왼쪽 <strong>ⓘ</strong> → 알림 → <strong>허용</strong> 후 아래 버튼을 다시 눌러 주세요.</p>
  `;
}

export function pushPermissionBlockedBanner(): string {
  if (isAndroid()) {
    return '알림이 차단되어 있습니다. ⋮ → 사이트 정보 → 권한 → 알림 허용, 또는 Chrome 설정 → 알림 → Chrome에서 상세설정에서 자동 차단을 해제한 뒤 다시 시도하세요.';
  }
  return '알림이 차단되어 있습니다. 주소창 ⓘ → 알림 → 허용 후 다시 시도하세요.';
}

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function hasPushApi(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export function getPushEnvKind(): PushEnvKind {
  if (isInAppBrowser()) return 'in_app';
  if (isIos() && !isStandalonePwa()) return 'ios_needs_homescreen';
  if (!hasPushApi()) return 'unsupported';
  return 'supported';
}

export function canUsePush(): boolean {
  return getPushEnvKind() === 'supported';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) throw new Error('Missing push subscription key');
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function subscriptionPayload(subscription: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = subscription.toJSON();
  const endpoint = subscription.endpoint || json.endpoint;
  if (!endpoint) throw new Error('Missing push endpoint');

  const p256dh =
    json.keys?.p256dh ?? arrayBufferToBase64Url(subscription.getKey('p256dh'));
  const auth = json.keys?.auth ?? arrayBufferToBase64Url(subscription.getKey('auth'));

  return { endpoint, keys: { p256dh, auth } };
}

/** Fetch VAPID key + register SW before the user taps subscribe (avoids losing gesture on mobile). */
export function preparePush(): Promise<void> {
  if (!canUsePush()) return Promise.resolve();
  if (cachedVapidPublicKey) return Promise.resolve();
  if (preparePromise) return preparePromise;

  preparePromise = (async () => {
    const keyRes = await fetch('/api/push/vapid-public-key', {
      credentials: 'same-origin',
    });
    if (!keyRes.ok) throw new Error('VAPID key fetch failed');
    const keyData = (await keyRes.json()) as {
      enabled: boolean;
      publicKey?: string;
    };
    if (!keyData.enabled || !keyData.publicKey) {
      throw new Error('Push not enabled on server');
    }
    cachedVapidPublicKey = keyData.publicKey;
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  })().catch((err) => {
    preparePromise = null;
    throw err;
  });

  return preparePromise;
}

/** Call only after Notification.permission === 'granted'. */
export async function subscribeToPush(): Promise<void> {
  if (Notification.permission !== 'granted') {
    throw new Error('알림 권한이 없습니다.');
  }

  await preparePush();
  if (!cachedVapidPublicKey) {
    throw new Error('푸시 준비 중입니다. 잠시 후 다시 시도해 주세요.');
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cachedVapidPublicKey),
  });

  const payload = subscriptionPayload(subscription);
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Subscribe failed: ${res.status} ${detail}`);
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (registration) {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
  const res = await fetch('/api/push/unsubscribe', {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`Unsubscribe failed: ${res.status}`);
}
