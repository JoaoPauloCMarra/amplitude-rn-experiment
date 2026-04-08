import fs from 'fs';
import path from 'path';

import { Poller } from '@amplitude/experiment-core';

import { ExperimentClient } from '../src/experimentClient';
import { DefaultUserProvider } from '../src/integration/default';
import { LocalStorage } from '../src/storage/local-storage';
import type { HttpClient, SimpleResponse } from '../src/types/transport';
import type { ExperimentUser, ExperimentUserProvider } from '../src/types/user';

const API_KEY = 'client-maintenance-tests';
const testUser: ExperimentUser = { user_id: 'maintenance-test-user' };

beforeEach(async () => {
  await new LocalStorage().reset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

class AsyncUserProvider implements ExperimentUserProvider {
  async getUser(): Promise<ExperimentUser> {
    return { user_id: 'async-provider-user' };
  }
}

test('DefaultUserProvider only starts polling when the base provider is async', () => {
  const startSpy = jest.spyOn(Poller.prototype, 'start');

  const withoutBaseProvider = new DefaultUserProvider();
  withoutBaseProvider.stop();
  expect(startSpy).not.toHaveBeenCalled();

  const withAsyncProvider = new DefaultUserProvider(new AsyncUserProvider());
  withAsyncProvider.stop();
  expect(startSpy).toHaveBeenCalledTimes(1);
});

test('DefaultUserProvider starts polling when an async provider is attached later', () => {
  const startSpy = jest.spyOn(Poller.prototype, 'start');

  const provider = new DefaultUserProvider();
  provider.stop();
  startSpy.mockClear();

  provider.baseProvider = new AsyncUserProvider();
  provider.start();
  provider.stop();

  expect(startSpy).toHaveBeenCalledTimes(1);
});

test('ExperimentClient.stop cancels scheduled fetch retries', async () => {
  jest.useFakeTimers();

  class FailingHttpClient implements HttpClient {
    public calls = 0;

    async request(): Promise<SimpleResponse> {
      this.calls += 1;
      return { status: 500, body: '{}' };
    }
  }

  const httpClient = new FailingHttpClient();
  const client = new ExperimentClient(API_KEY, {
    httpClient,
    retryFetchOnFailure: true,
  });

  await client.fetch(testUser);
  expect(httpClient.calls).toBe(1);

  client.stop();
  jest.advanceTimersByTime(2000);
  await Promise.resolve();
  await Promise.resolve();

  expect(httpClient.calls).toBe(1);
});

test('ExperimentClient.stop stops the default user provider lifecycle', () => {
  const stopSpy = jest.spyOn(DefaultUserProvider.prototype, 'stop');
  const client = new ExperimentClient(API_KEY, {
    userProvider: new AsyncUserProvider(),
  });

  client.stop();

  expect(stopSpy).toHaveBeenCalledTimes(1);
});

test('Android manifests do not request coarse location permission', () => {
  const manifestPaths = [
    path.resolve(__dirname, '..', 'android/src/main/AndroidManifest.xml'),
    path.resolve(__dirname, '..', 'android/src/main/AndroidManifestNew.xml'),
  ];

  for (const manifestPath of manifestPaths) {
    const contents = fs.readFileSync(manifestPath, 'utf8');
    expect(contents).not.toContain('android.permission.ACCESS_COARSE_LOCATION');
  }
});
