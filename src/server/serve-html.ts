import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Context } from 'hono';
import { getBaseUrl } from './services/notification-hash.js';

export function createHtmlHandler(publicDir: string, filename: string) {
  const filePath = resolve(publicDir, filename);
  return (c: Context) => {
    const html = readFileSync(filePath, 'utf-8');
    const siteUrl = getBaseUrl();
    return c.html(html.replaceAll('__SITE_URL__', siteUrl));
  };
}
