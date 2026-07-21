import { ConsentType, JourneyStatus } from '../database/database.types';

export const REQUIRED_CONSENTS = [ConsentType.INFORMED, ConsentType.PRIVACY, ConsentType.SENSITIVE_DATA] as const;
export function hasRequiredConsents(consents: { consentType: ConsentType; accepted: boolean }[]): boolean {
  return new Set(consents.map((item) => item.consentType)).size === consents.length && REQUIRED_CONSENTS.every((type) => consents.some((item) => item.consentType === type && item.accepted));
}
export function isValidPosition(position: number): boolean { return Number.isInteger(position) && position >= 1 && position <= 5; }
export function canDrawAt(status: JourneyStatus, currentStep: number, position: number): boolean { return status === JourneyStatus.EM_TIRAGEM && currentStep === position; }
export function canDrawImage(set: { wordKey: string | null } | undefined): boolean { return Boolean(set?.wordKey); }
export function canAdvance(currentStep: number, set?: { wordKey: string | null; imageKey: string | null }): boolean { return currentStep === 0 || Boolean(set?.wordKey && set.imageKey); }
export function unusedCardIds(allIds: string[], usedIds: Array<string | null>): string[] { const used = new Set(usedIds.filter((id): id is string => Boolean(id))); return allIds.filter((id) => !used.has(id)); }
