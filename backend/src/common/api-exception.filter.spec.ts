import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

interface ResponseHarness {
  host: ArgumentsHost;
  status: jest.Mock<TestResponse, [number]>;
  json: jest.Mock<void, [Record<string, unknown>]>;
}

interface TestResponse {
  status: jest.Mock<TestResponse, [number]>;
  json: jest.Mock<void, [Record<string, unknown>]>;
}

function responseHarness(): ResponseHarness {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn<TestResponse, [number]>();
  const response: TestResponse = { status, json };
  response.status.mockReturnValue(response);

  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;

  return { host, status: response.status, json };
}

describe('ApiExceptionFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registra somente metadados seguros de 4xx e retorna o mesmo correlationId', () => {
    let loggedEntry: unknown;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((entry: unknown) => {
      loggedEntry = entry;
    });
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const harness = responseHarness();
    const sensitiveMessage = 'Relato íntimo que não pode aparecer no log';
    const sensitiveAnswer = 'Resposta pessoal que não pode aparecer no log';
    const exception = new HttpException({
      code: 'INVALID_JOURNEY_STATE',
      message: sensitiveMessage,
      details: { answer: sensitiveAnswer, headers: { authorization: 'token-secreto' } }
    }, HttpStatus.CONFLICT);

    new ApiExceptionFilter().catch(exception, harness.host);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(warn.mock.calls[0]).toHaveLength(1);

    const logged = loggedEntry as Record<string, unknown>;
    const responseBody = harness.json.mock.calls[0][0];
    expect(Object.keys(logged).sort()).toEqual(['code', 'correlationId', 'status']);
    expect(typeof logged.correlationId).toBe('string');
    expect(logged).toEqual({
      correlationId: logged.correlationId,
      status: HttpStatus.CONFLICT,
      code: 'INVALID_JOURNEY_STATE'
    });
    expect(responseBody.correlationId).toBe(logged.correlationId);
    expect(JSON.stringify(logged)).not.toContain(sensitiveMessage);
    expect(JSON.stringify(logged)).not.toContain(sensitiveAnswer);
    expect(JSON.stringify(logged)).not.toContain('token-secreto');
    expect(harness.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });

  it('registra 5xx como erro sem incluir exception, message ou stack', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    let loggedEntry: unknown;
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation((entry: unknown) => {
      loggedEntry = entry;
    });
    const harness = responseHarness();
    const exception = new Error('Falha interna com conteúdo sensível');
    exception.stack = 'stack-secreta';

    new ApiExceptionFilter().catch(exception, harness.host);

    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(error.mock.calls[0]).toHaveLength(1);

    const logged = loggedEntry as Record<string, unknown>;
    const responseBody = harness.json.mock.calls[0][0];
    expect(typeof logged.correlationId).toBe('string');
    expect(logged).toEqual({
      correlationId: logged.correlationId,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR'
    });
    expect(responseBody.correlationId).toBe(logged.correlationId);
    expect(JSON.stringify(logged)).not.toContain(exception.message);
    expect(JSON.stringify(logged)).not.toContain(exception.stack);
  });

  it('substitui código não público antes de registrar e responder', () => {
    let loggedEntry: unknown;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((entry: unknown) => {
      loggedEntry = entry;
    });
    const harness = responseHarness();
    const exception = new HttpException({
      code: 'código derivado de conteúdo sensível',
      message: 'Solicitação inválida.'
    }, HttpStatus.BAD_REQUEST);

    new ApiExceptionFilter().catch(exception, harness.host);

    const logged = loggedEntry as Record<string, unknown>;
    const responseBody = harness.json.mock.calls[0][0];
    expect(logged.code).toBe('REQUEST_FAILED');
    expect(responseBody.code).toBe('REQUEST_FAILED');
    expect(responseBody.correlationId).toBe(logged.correlationId);
  });
});
