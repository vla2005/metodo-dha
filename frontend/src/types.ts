export interface Theme {
  id: string;
  name: string;
  description: string;
}

export interface JourneyImage {
  url: string;
  objectiveDescription: string;
  alternativeText: string;
  descriptionReviewed: boolean;
  descriptionSource: 'catalog_json_ai_draft';
}

export interface JourneySet {
  position: number;
  movement: string;
  initialImpression?: string;
  wordCard?: { word: string } | null;
  imageCard?: JourneyImage | null;
}

export type JourneyStatus =
  | 'EM_PREPARACAO'
  | 'EM_TIRAGEM'
  | 'CARTAS_CONCLUIDAS'
  | 'PERGUNTAS_DISPONIVEIS'
  | 'RESPOSTAS_CONCLUIDAS';

export interface Journey {
  publicId: string;
  status: JourneyStatus;
  currentStep: number;
  theme: { id: string; name: string };
  customTheme?: string;
  circumstanceText: string;
  sets: JourneySet[];
}

export type QuestionResponseType =
  | 'TEXT'
  | 'NO_RELATION'
  | 'DONT_KNOW'
  | 'PREFER_NOT_TO_ANSWER'
  | 'SKIPPED';

export interface ReflectiveAnswer {
  responseType: QuestionResponseType;
  text: string | null;
}

export interface ReflectiveQuestion {
  id: string;
  type: 'STEP' | 'INTEGRATIVE';
  displayOrder: number;
  stepNumber: number | null;
  stageName: string | null;
  text: string;
  answer: ReflectiveAnswer | null;
}

export interface QuestionsSnapshot {
  generationStatus: 'AVAILABLE' | 'ANSWERS_COMPLETED';
  generationMode: 'DEMO' | 'GEMINI';
  reflectionSequence: string;
  initialInterpretation?: {
    sequenceView: string;
    movements: Array<{
      stepNumber: number;
      stepName: string;
      whatTheSetReveals: string;
      reflectionQuestion: string;
      consciousnessInvitation: string;
      questionId: string | null;
    }>;
    initialSynthesis: string;
    disclaimer: string;
  };
  questions: ReflectiveQuestion[];
  safety: {
    requiresPause: boolean;
    requiresProfessionalReview: boolean;
    reason: string;
  };
  notice: string;
  answeredCount: number;
  totalCount: number;
  answersComplete: boolean;
}

export interface AnalysisStage {
  stepNumber: number;
  stageName: string;
  groundedFacts: string[];
  participantAssociations: string[];
  reflectivePossibilities: string[];
  openQuestions: string[];
  synthesis: string;
}

export interface AnalysisSnapshot {
  generationStatus: 'AVAILABLE';
  generationMode: 'DEMO' | 'GEMINI';
  summary: string;
  stages: AnalysisStage[];
  sequenceSynthesis: string;
  possibleConnections: string[];
  uncertainties: string[];
  nextReflections: string[];
  safety: {
    requiresPause: boolean;
    requiresProfessionalReview: boolean;
    reason: string | null;
  };
  notice: string;
}
