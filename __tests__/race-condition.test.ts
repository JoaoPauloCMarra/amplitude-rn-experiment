import { SdkEvaluationApi } from '@amplitude/experiment-core';

import { ExperimentClient } from '../src/experimentClient';
import { LocalStorage } from '../src/storage/local-storage';
import type { HttpClient, SimpleResponse } from '../src/types/transport';
import type { ExperimentUser } from '../src/types/user';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const API_KEY = 'client-test-race-condition';
const testUser: ExperimentUser = { user_id: 'test_user' };

beforeEach(async () => {
  await new LocalStorage().reset();
});

class DelayedHttpClient implements HttpClient {
  private readonly delayMs: number;
  private readonly response: SimpleResponse;

  constructor(delayMs: number, response: SimpleResponse) {
    this.delayMs = delayMs;
    this.response = response;
  }

  async request(): Promise<SimpleResponse> {
    await delay(this.delayMs);
    return this.response;
  }
}

function replaceEvaluationApi(
  client: ExperimentClient,
  httpClient: HttpClient,
): void {
  Reflect.set(
    client,
    'evaluationApi',
    new SdkEvaluationApi(API_KEY, 'https://api.lab.amplitude.com', {
      request: httpClient.request.bind(httpClient),
    }),
  );
}

test('ExperimentClient.fetch ignores stale concurrent responses', async () => {
  const slowClient = new DelayedHttpClient(200, {
    status: 200,
    body: JSON.stringify({
      'test-flag': {
        key: 'old',
        value: 'old-value',
      },
    }),
  });

  const fastClient = new DelayedHttpClient(50, {
    status: 200,
    body: JSON.stringify({
      'test-flag': {
        key: 'new',
        value: 'new-value',
      },
    }),
  });

  const client = new ExperimentClient(API_KEY, {
    httpClient: slowClient,
  });

  const firstFetch = client.fetch(testUser);
  await delay(10);

  replaceEvaluationApi(client, fastClient);

  const secondFetch = client.fetch(testUser);

  await Promise.all([firstFetch, secondFetch]);

  expect(client.variant('test-flag').value).toBe('new-value');
});

test('ExperimentClient.fetch stores the last initiated response', async () => {
  class CountingHttpClient implements HttpClient {
    private readonly id: number;
    private readonly delayMs: number;

    constructor(id: number, delayMs: number) {
      this.id = id;
      this.delayMs = delayMs;
    }

    async request(): Promise<SimpleResponse> {
      await delay(this.delayMs);
      return {
        status: 200,
        body: JSON.stringify({
          'test-flag': {
            key: `response-${this.id}`,
            value: `value-${this.id}`,
          },
        }),
      };
    }
  }

  const client = new ExperimentClient(API_KEY, {
    httpClient: new CountingHttpClient(1, 100),
  });

  const firstFetch = client.fetch(testUser);
  await delay(10);

  replaceEvaluationApi(client, new CountingHttpClient(2, 50));

  const secondFetch = client.fetch(testUser);

  await Promise.all([firstFetch, secondFetch]);

  expect(client.variant('test-flag').value).toBe('value-2');
});
