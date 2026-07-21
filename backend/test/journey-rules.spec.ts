import { ConsentType, JourneyStatus } from '../src/database/database.types';
import { canAdvance, canDrawAt, canDrawImage, hasRequiredConsents, isValidPosition, unusedCardIds } from '../src/jornadas/journey-rules';

describe('regras da jornada DHA', () => {
  const consents = [ConsentType.INFORMED, ConsentType.PRIVACY, ConsentType.SENSITIVE_DATA].map((consentType) => ({ consentType, accepted: true }));
  it('aceita os trÃªs consentimentos obrigatÃ³rios', () => expect(hasRequiredConsents(consents)).toBe(true));
  it('recusa consentimento ausente', () => expect(hasRequiredConsents(consents.slice(0, 2))).toBe(false));
  it('recusa consentimento nÃ£o aceito', () => expect(hasRequiredConsents(consents.map((c, index) => index === 1 ? { ...c, accepted: false } : c))).toBe(false));
  it('recusa consentimento duplicado', () => expect(hasRequiredConsents([...consents, consents[0]])).toBe(false));
  it('aceita somente posiÃ§Ãµes de um a cinco', () => { expect([1, 2, 3, 4, 5].every(isValidPosition)).toBe(true); expect(isValidPosition(0)).toBe(false); expect(isValidPosition(6)).toBe(false); });
  it('permite sorteio apenas na etapa corrente e em tiragem', () => { expect(canDrawAt(JourneyStatus.EM_TIRAGEM, 2, 2)).toBe(true); expect(canDrawAt(JourneyStatus.EM_TIRAGEM, 2, 3)).toBe(false); expect(canDrawAt(JourneyStatus.EM_PREPARACAO, 0, 1)).toBe(false); });
  it('bloqueia imagem antes da palavra', () => expect(canDrawImage(undefined)).toBe(false));
  it('libera imagem depois da palavra', () => expect(canDrawImage({ wordKey: 'palavra-001' })).toBe(true));
  it('bloqueia avanÃ§o com conjunto incompleto', () => expect(canAdvance(1, { wordKey: 'palavra-001', imageKey: null })).toBe(false));
  it('libera avanÃ§o com conjunto completo', () => expect(canAdvance(1, { wordKey: 'palavra-001', imageKey: 'imagem-001' })).toBe(true));
  it('libera a transiÃ§Ã£o da preparaÃ§Ã£o', () => expect(canAdvance(0)).toBe(true));
  it('elimina cartas jÃ¡ usadas da lista elegÃ­vel', () => expect(unusedCardIds(['a', 'b', 'c'], ['a', null, 'c'])).toEqual(['b']));
});


