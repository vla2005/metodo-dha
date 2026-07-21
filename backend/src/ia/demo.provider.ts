import { Injectable } from '@nestjs/common';
import {
  IaProviderError,
  analysisGenerationContextSchema,
  analysisGenerationSchema,
  questionGenerationContextSchema,
  questionGenerationSchema,
  type AnaliseGerada,
  type AnalysisGenerationContext,
  type IaInput,
  type IaProviderResult,
  type IaUsage,
  type PerguntasGeradas,
  type ProvedorIa,
  type QuestionGenerationContext,
  type RodadaAyaGerada,
} from './provedor-ia';

const DEMO_USAGE: IaUsage = {
  promptTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
  totalTokens: 0,
};

@Injectable()
export class DemoIaProvider implements ProvedorIa {
  readonly name = 'demo' as const;
  readonly usesRemoteQuota = false;
  readonly model = 'demo-dha-local-v1';

  gerarPerguntas(
    context: QuestionGenerationContext,
  ): Promise<IaProviderResult<PerguntasGeradas>> {
    const parsedContext = questionGenerationContextSchema.safeParse(context);
    if (!parsedContext.success) {
      throw new IaProviderError('INVALID_REQUEST', false);
    }

    const generated = questionGenerationSchema.parse({
      reflexaoSequencia: `Esta sequência oferece cinco pontos de observação sobre o tema “${parsedContext.data.theme}”. No modo demonstrativo, as perguntas servem apenas para experimentar o percurso e não constituem análise da pessoa.`,
      etapas: parsedContext.data.steps.map((step) => ({
        numeroEtapa: step.number,
        nomeEtapa: step.name,
        perguntas: [
          `Ao observar a palavra “${step.word}” junto da imagem em ${step.name.toLocaleLowerCase('pt-BR')}, o que se aproxima — ou não — da situação que você relatou?`,
        ],
      })),
      perguntasIntegradoras: [],
      sinalizacaoSeguranca: {
        requerPausa: false,
        requerRevisaoProfissional: true,
        motivo: 'O modo demonstrativo local não avalia o conteúdo do relato nem substitui revisão profissional.',
      },
      aviso: 'Conteúdo demonstrativo gerado localmente, sem chamada ao Gemini e sem análise clínica ou diagnóstico.',
    });

    return Promise.resolve(this.result(generated));
  }

  gerarAnalise(
    context: AnalysisGenerationContext,
  ): Promise<IaProviderResult<AnaliseGerada>> {
    const parsedContext = analysisGenerationContextSchema.safeParse(context);
    if (!parsedContext.success) {
      throw new IaProviderError('INVALID_REQUEST', false);
    }

    const generated = analysisGenerationSchema.parse({
      resumoCircunstancia: `O percurso sobre o tema “${parsedContext.data.theme}” foi concluído. O modo demonstrativo confirma o fluxo técnico, mas não interpreta o relato nem as respostas.`,
      reflexoesEtapas: parsedContext.data.steps.map((step) => ({
        numeroEtapa: step.number,
        nomeEtapa: step.name,
        fatosFundamentados: [],
        associacoesParticipante: [],
        possibilidadesReflexivas: [],
        perguntasAbertas: [],
        sintese: `A etapa ${step.number}, ${step.name}, foi registrada sem interpretação automática no modo demonstrativo.`,
      })),
      sinteseSequencia: 'Nenhuma interpretação foi realizada. Este conteúdo apenas mantém o contrato técnico do MVP.',
      conexoesPossiveis: [],
      incertezas: ['O modo demonstrativo não interpreta relatos nem respostas.'],
      proximasReflexoes: ['Revise suas respostas com autonomia e procure suporte humano quando desejar.'],
      sinalizacaoSeguranca: {
        requerPausa: false,
        requerRevisaoProfissional: true,
        motivo: 'O modo demonstrativo local não realiza avaliação de segurança.',
      },
      aviso: 'Conteúdo demonstrativo local; não é diagnóstico nem substitui cuidado profissional.',
    });

    return Promise.resolve(this.result(generated));
  }

  executarRodadaAya(input: IaInput): Promise<IaProviderResult<RodadaAyaGerada>> {
    void input;
    return Promise.resolve(this.result({
      reconhecimento: 'Esta é uma resposta demonstrativa local e não representa uma análise do seu relato.',
      perguntas: ['O que você gostaria de observar com mais calma antes de continuar?'],
      podeEncerrar: true,
      sinalizacaoSeguranca: {
        requerPausa: false,
        requerRevisaoProfissional: true,
        motivo: 'O modo demonstrativo local não realiza avaliação de segurança.',
      },
    }));
  }

  private result<T>(data: T): IaProviderResult<T> {
    return {
      data,
      usage: DEMO_USAGE,
      providerRequestId: null,
      model: this.model,
    };
  }
}
