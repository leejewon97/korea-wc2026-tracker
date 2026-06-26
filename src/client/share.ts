interface PublicConfig {
  siteUrl: string;
  kakaoJsKey: string | null;
  shareTitle: string;
  shareDescription: string;
  ogImageUrl: string;
}

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (settings: Record<string, unknown>) => void;
      };
    };
  }
}

let configPromise: Promise<PublicConfig> | null = null;

function loadPublicConfig(): Promise<PublicConfig> {
  if (!configPromise) {
    configPromise = fetch('/api/public-config')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PublicConfig>;
      })
      .catch((err) => {
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

function loadKakaoSdk(): Promise<void> {
  if (window.Kakao) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://developers.kakao.com/sdk/js/kakao.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Kakao SDK load failed'));
    document.head.appendChild(script);
  });
}

async function shareWithKakao(config: PublicConfig): Promise<boolean> {
  if (!config.kakaoJsKey) return false;

  await loadKakaoSdk();
  const Kakao = window.Kakao;
  if (!Kakao) return false;

  if (!Kakao.isInitialized()) {
    Kakao.init(config.kakaoJsKey);
  }

  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title: config.shareTitle,
      description: config.shareDescription,
      imageUrl: config.ogImageUrl,
      link: {
        mobileWebUrl: config.siteUrl,
        webUrl: config.siteUrl,
      },
    },
    buttons: [
      {
        title: '현황 보기',
        link: {
          mobileWebUrl: config.siteUrl,
          webUrl: config.siteUrl,
        },
      },
    ],
  });
  return true;
}

async function fallbackShare(config: PublicConfig): Promise<void> {
  const payload = {
    title: config.shareTitle,
    text: config.shareDescription,
    url: config.siteUrl,
  };

  if (navigator.share) {
    await navigator.share(payload);
    return;
  }

  await navigator.clipboard.writeText(config.siteUrl);
  alert('링크가 복사되었습니다. 카카오톡에 붙여넣어 공유해 주세요.');
}

export function initKakaoShare(): void {
  const btn = document.getElementById('kakao-share-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    void (async () => {
      try {
        const config = await loadPublicConfig();
        const shared = await shareWithKakao(config);
        if (!shared) {
          await fallbackShare(config);
        }
      } catch (err) {
        console.error(err);
        alert('공유에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    })();
  });
}
