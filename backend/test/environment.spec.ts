import 'reflect-metadata';
import { validateEnvironment } from '../src/config/environment';

describe('configuraÃ§Ã£o de ambiente', () => {
  it('converte nÃºmeros recebidos como strings pelo Docker Compose', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'production',
      PORT: '3000',
      API_PREFIX: 'api',
      FRONTEND_ORIGINS: 'http://localhost:8080',
      DATABASE_URL: 'postgresql://postgres:postgres@postgres:5432/metodo_dha',
      CARD_IMAGES_DIR: '/app/imagens',
      PUBLIC_SESSION_COOKIE_NAME: 'dha_session',
      PUBLIC_SESSION_TTL_HOURS: '72',
      PUBLIC_SESSION_COOKIE_SECURE: 'false',
      PUBLIC_SESSION_COOKIE_SAME_SITE: 'lax',
      GEMINI_MODEL: 'gemini-3.1-flash-lite',
      GEMINI_DAILY_HARD_LIMIT: '500',
      GEMINI_DAILY_OPERATIONAL_LIMIT: '450',
      GEMINI_TIMEOUT_MS: '30000',
      GEMINI_MAX_RETRIES: '1'
    });
    expect(environment.PORT).toBe(3000);
    expect(environment.PUBLIC_SESSION_TTL_HOURS).toBe(72);
    expect(environment.GEMINI_DAILY_OPERATIONAL_LIMIT).toBe(450);
    expect(environment.GEMINI_TIMEOUT_MS).toBe(30000);
  });
});


