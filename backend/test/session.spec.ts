import { createOpaqueToken, hashToken } from '../src/common/session';
describe('sessÃ£o pÃºblica opaca', () => {
  it('gera tokens de alta entropia distintos', () => { const first = createOpaqueToken(); const second = createOpaqueToken(); expect(first).not.toBe(second); expect(first.length).toBeGreaterThanOrEqual(40); });
  it('persiste somente um hash determinÃ­stico', () => { const token = createOpaqueToken(); const hash = hashToken(token); expect(hash).toHaveLength(64); expect(hash).not.toContain(token); expect(hashToken(token)).toBe(hash); });
});


