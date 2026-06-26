import { Hono } from 'hono';
import { getKakaoJavaScriptKey } from '../services/kakao.js';
import { getBaseUrl } from '../services/notification-hash.js';

export const publicConfigRoutes = new Hono();

publicConfigRoutes.get('/public-config', (c) => {
  const siteUrl = getBaseUrl();
  return c.json({
    siteUrl,
    kakaoJsKey: getKakaoJavaScriptKey() ?? null,
    shareTitle: '대한민국 32강 진출 트래커',
    shareDescription:
      '6개 조 3차전 조건 중 3개 이상 필요. 결과가 나오면, 조 3위 중 상위 8팀 진출 가능',
    ogImageUrl: `${siteUrl}/og-image.png`,
  });
});
