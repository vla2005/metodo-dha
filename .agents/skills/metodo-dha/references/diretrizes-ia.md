# Decisões confirmadas do produto

## Stack

- O frontend será criado inicialmente no Lovable com React e TypeScript.
- O backend será Node.js com NestJS e TypeScript.
- O banco será PostgreSQL com Prisma.
- A integração de IA usará a Gemini API.
- O modelo pretendido é `gemini-3.1-flash-lite`, configurável por ambiente.
- O orçamento informado é de 500 requisições por dia.
- A arquitetura inicial será monólito modular.

## Identificação e acesso da pessoa participante

- A pessoa participante não cria conta.
- A pessoa participante não define senha.
- A pessoa participante não faz login.
- Ao iniciar uma análise, informa nome e e-mail para contato.
- O aceite do consentimento vigente ocorre no início da jornada.
- O e-mail serve para contato e possível envio de link seguro de retomada; não serve sozinho como credencial de acesso.
- O backend cria uma sessão pública segura e vinculada à jornada.
- Para retomada no mesmo navegador, usar token opaco em cookie `httpOnly`.
- Para retomada em outro dispositivo, usar futuramente link temporário, de uso único e enviado ao e-mail, sem senha.
- Uma eventual área profissional ou administrativa deve permanecer protegida por autenticação própria.

## Cartas

- As cartas são aleatórias.
- As cartas ficam viradas para baixo antes da escolha.
- A pessoa não pode saber qual palavra ou imagem está escolhendo.
- Cada etapa começa pela palavra e depois segue para a imagem.
- Após revelar uma carta, não é permitido trocar.
- Os cinco conjuntos são realizados em sequência.
- A posição clicada não deve revelar previamente o resultado.
- Atualizar a página não pode produzir uma nova carta.
- O sorteio será controlado pelo backend.

## Interpretação

- A circunstância relatada inicialmente fornece o contexto da interpretação.
- A palavra não precisa ser literal.
- A palavra não representa necessariamente o sentimento atual da pessoa.
- A imagem não precisa parecer relacionada à palavra.
- A sequência completa importa mais do que um significado isolado.
- A pessoa não precisa compreender a combinação imediatamente.
- Uma combinação aparentemente desconectada continua válida.

## IA

- O sistema deve reduzir o número de requisições diárias.
- O padrão pretendido é uma chamada para todas as perguntas e uma chamada para análise e relatório.
- Não deve existir uma chamada de IA a cada carta.
- AYA é opcional.
- AYA deve possuir quantidade limitada de rodadas.
- Resultados de IA devem ser salvos e reutilizados.
- O frontend nunca terá acesso à chave Gemini.

## Fluxo atual pretendido

1. Informar nome e e-mail para contato e aceitar o consentimento.
2. Escolher o tema.
3. Registrar o relato inicial da circunstância.
4. Fazer a preparação e respiração.
5. Retirar os cinco conjuntos em ordem.
6. Visualizar a sequência completa.
7. A IA gera perguntas personalizadas.
8. A pessoa responde.
9. A IA gera análise e relatório.
10. AYA opcional para aprofundamento.

## Pendências

- confirmar se o relato inicial será apenas texto no MVP ou também áudio;
- confirmar se cartas podem se repetir dentro da mesma jornada;
- confirmar se todos os relatórios exigem aprovação profissional;
- confirmar se oração fará parte do produto e em quais condições;
- decidir se haverá envio automático de link de retomada por e-mail no MVP;
- definir política de retenção e exclusão de dados;
- revisar textos jurídicos, LGPD e responsabilidade profissional antes da produção.
