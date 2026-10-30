import { ConfigService } from '@nestjs/config';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppConfig } from '../src/config/configuration';
import { EmailSendError } from '../src/messaging/email-send.error';
import { ResendEmailProvider } from '../src/messaging/resend-email.provider';
import { RenderedEmail } from '../src/types/rendered-email.types';

type StubReply = { status: number; body: unknown };
type ReceivedRequest = { path: string; headers: IncomingHttpHeaders; body: unknown };

const EMAIL: RenderedEmail = {
  to: 'ann@example.com',
  subject: 'Hi',
  html: '<p>Hi</p>',
  idempotencyKey: 'message-1',
};

function resendError(status: number, name: string): StubReply {
  return { status, body: { statusCode: status, name, message: `${name} happened` } };
}

/**
 * The real Resend SDK against a local stub of its HTTP API (the SDK honours RESEND_BASE_URL), so
 * the adapter's mapping of provider answers to "rejected" vs "outcome unknown" is checked end to end.
 */
describe('ResendEmailProvider', () => {
  let server: Server;
  let reply: StubReply;
  let received: ReceivedRequest[];
  let provider: ResendEmailProvider;
  const previousBaseUrl = process.env.RESEND_BASE_URL;

  beforeAll(async () => {
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        received.push({ path: request.url ?? '', headers: request.headers, body: JSON.parse(raw) });
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.RESEND_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    provider = createProvider();
  });
  afterAll(async () => {
    process.env.RESEND_BASE_URL = previousBaseUrl;
    await new Promise((resolve) => server.close(resolve));
  });
  beforeEach(() => {
    received = [];
  });

  function createProvider(): ResendEmailProvider {
    const emailConfig = {
      resendApiKey: 're_test',
      fromAddress: 'from@example.com',
      concurrency: 1,
    };
    const configService = { get: () => emailConfig } as unknown as ConfigService<AppConfig, true>;
    return new ResendEmailProvider(configService);
  }

  it('sends with the idempotency key and returns the provider id', async () => {
    reply = { status: 200, body: { id: 'resend-id-1' } };
    await expect(provider.send(EMAIL)).resolves.toEqual({ providerMessageId: 'resend-id-1' });
    expect(received).toEqual([
      expect.objectContaining({
        path: '/emails',
        body: { from: 'from@example.com', to: 'ann@example.com', subject: 'Hi', html: '<p>Hi</p>' },
      }),
    ]);
    expect(received[0].headers).toMatchObject({
      authorization: 'Bearer re_test',
      'idempotency-key': 'message-1',
    });
  });

  it('reports a 4xx as a rejection, retryable only when rate limited', async () => {
    reply = resendError(422, 'validation_error');
    const rejected = await provider.send(EMAIL).catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(EmailSendError);
    expect(rejected).toMatchObject({ retryable: false });

    reply = resendError(429, 'rate_limit_exceeded');
    await expect(provider.send(EMAIL)).rejects.toMatchObject({ retryable: true });
  });

  it('reports a 5xx, a concurrent idempotent request and a network failure as unknown outcomes', async () => {
    reply = resendError(500, 'internal_server_error');
    const serverError = await provider.send(EMAIL).catch((error: unknown) => error);
    expect(serverError).toBeInstanceOf(Error);
    expect(serverError).not.toBeInstanceOf(EmailSendError);

    reply = resendError(409, 'concurrent_idempotent_requests');
    const concurrent = await provider.send(EMAIL).catch((error: unknown) => error);
    expect(concurrent).toBeInstanceOf(Error);
    expect(concurrent).not.toBeInstanceOf(EmailSendError);

    process.env.RESEND_BASE_URL = 'http://127.0.0.1:1';
    const unreachable = await createProvider()
      .send(EMAIL)
      .catch((error: unknown) => error);
    process.env.RESEND_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect(unreachable).toBeInstanceOf(Error);
    expect(unreachable).not.toBeInstanceOf(EmailSendError);
  });
});
