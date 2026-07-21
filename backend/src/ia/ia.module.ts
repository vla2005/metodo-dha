import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DemoIaProvider } from './demo.provider';
import { GeminiProvider } from './gemini.provider';
import { PROVEDOR_IA, type ProvedorIa } from './provedor-ia';

@Module({
  providers: [
    GeminiProvider,
    DemoIaProvider,
    {
      provide: PROVEDOR_IA,
      inject: [ConfigService, GeminiProvider, DemoIaProvider],
      useFactory: (
        config: ConfigService,
        gemini: GeminiProvider,
        demo: DemoIaProvider,
      ): ProvedorIa => {
        const mode = config.get<'auto' | 'gemini' | 'demo'>('AI_PROVIDER', 'auto');
        if (mode === 'demo') return demo;
        if (mode === 'gemini') return gemini;
        return config.get<string>('GEMINI_API_KEY')?.trim() ? gemini : demo;
      },
    },
  ],
  exports: [PROVEDOR_IA],
})
export class IaModule {}
