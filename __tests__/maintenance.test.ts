import fs from 'fs';
import path from 'path';

import type {
  Identity,
  IdentityEditor,
  IdentityListener,
} from '@amplitude/analytics-connector';
import { AnalyticsConnector } from '@amplitude/analytics-connector';
import { Poller } from '@amplitude/experiment-core';

import { ExperimentClient } from '../src/experimentClient';
import { Experiment } from '../src/factory';
import { ConnectorUserProvider } from '../src/integration/connector';
import { DefaultUserProvider } from '../src/integration/default';
import { getVariantsOptionsStorage } from '../src/storage/cache';
import { LocalStorage, MemoryStorage } from '../src/storage/local-storage';
import { FetchHttpClient } from '../src/transport/http';
import { LogLevel, type Logger } from '../src/types/logger';
import type { Storage } from '../src/types/storage';
import type { HttpClient, SimpleResponse } from '../src/types/transport';
import type { ExperimentUser, ExperimentUserProvider } from '../src/types/user';
import { Backoff } from '../src/util/backoff';

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

class TestIdentityStore {
  private identity: Identity = {};
  public listeners = new Set<IdentityListener>();

  editIdentity(): IdentityEditor {
    throw Error('editIdentity is not implemented in this test store');
  }

  getIdentity(): Identity {
    return this.identity;
  }

  setIdentity(identity: Identity): void {
    this.identity = identity;
    for (const listener of this.listeners) {
      listener(identity);
    }
  }

  addIdentityListener(listener: IdentityListener): void {
    this.listeners.add(listener);
  }

  removeIdentityListener(listener: IdentityListener): void {
    this.listeners.delete(listener);
  }
}

class TestLogger implements Logger {
  error = jest.fn();
  warn = jest.fn();
  info = jest.fn();
  debug = jest.fn();
  verbose = jest.fn();
}

class RejectingStorage implements Storage {
  async get(): Promise<string | null> {
    return null;
  }

  async put(): Promise<void> {
    throw Error('storage failed');
  }

  async delete(): Promise<void> {
    return;
  }
}

test('DefaultUserProvider only starts polling when the base provider is async', () => {
  const startSpy = jest.spyOn(Poller.prototype, 'start');

  const withoutBaseProvider = new DefaultUserProvider();
  withoutBaseProvider.stop();
  expect(startSpy).not.toHaveBeenCalled();

  const withAsyncProvider = new DefaultUserProvider(new AsyncUserProvider());
  withAsyncProvider.start();
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

test('Backoff clears scheduled work after a successful retry', async () => {
  jest.useFakeTimers();
  const backoff = new Backoff(3, 100, 1000, 2);
  const fn = jest.fn(async () => undefined);

  backoff.start(fn);
  expect(jest.getTimerCount()).toBe(1);

  await jest.advanceTimersByTimeAsync(100);

  expect(fn).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('ConnectorUserProvider removes identity listener when identity becomes ready', async () => {
  jest.useFakeTimers();
  const store = new TestIdentityStore();
  const provider = new ConnectorUserProvider(store);
  const readyPromise = provider.identityReady(1000);

  expect(store.listeners.size).toBe(1);

  store.setIdentity({ userId: 'user-ready' });
  await readyPromise;

  expect(store.listeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('ConnectorUserProvider removes identity listener on timeout', async () => {
  jest.useFakeTimers();
  const store = new TestIdentityStore();
  const provider = new ConnectorUserProvider(store);
  const readyPromise = provider.identityReady(1000);

  expect(store.listeners.size).toBe(1);

  const timeoutExpectation = expect(readyPromise).rejects.toThrow(
    'Timed out waiting for Amplitude Analytics SDK to initialize.',
  );
  await jest.advanceTimersByTimeAsync(1000);

  await timeoutExpectation;
  expect(store.listeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('Experiment.initializeWithAmplitudeAnalytics removes identity listener on stop', () => {
  const instanceName = 'maintenance-listener-cleanup';
  const connector = AnalyticsConnector.getInstance(instanceName);
  const addSpy = jest
    .spyOn(connector.identityStore, 'addIdentityListener')
    .mockImplementation(() => undefined);
  const removeSpy = jest
    .spyOn(connector.identityStore, 'removeIdentityListener')
    .mockImplementation(() => undefined);
  const fetchSpy = jest.spyOn(
    ExperimentClient.prototype,
    'fetchOnIdentityChange',
  );
  const fetchOrThrowSpy = jest.spyOn(
    ExperimentClient.prototype,
    'fetchOrThrow',
  );

  const client = Experiment.initializeWithAmplitudeAnalytics(
    'client-maintenance-listener-cleanup',
    {
      instanceName,
      automaticFetchOnAmplitudeIdentityChange: true,
    },
  );

  expect(addSpy).toHaveBeenCalledTimes(1);
  const listener = addSpy.mock.calls[0]?.[0];
  expect(listener).toBeDefined();

  listener?.({});
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchOrThrowSpy).not.toHaveBeenCalled();

  client.stop();

  expect(removeSpy.mock.calls[0]?.[0]).toBe(listener);
  client.stop();
  expect(removeSpy).toHaveBeenCalledTimes(1);
});

test('ExperimentClient.setTracksAssignment rejects storage persistence failures', async () => {
  const client = new ExperimentClient('client-maintenance-storage-rejects', {
    storage: new RejectingStorage(),
  });

  await expect(client.setTracksAssignment(true)).rejects.toThrow(
    'storage failed',
  );
});

test('ExperimentClient.clear logs storage persistence failures', async () => {
  const loggerProvider = new TestLogger();
  const client = new ExperimentClient('client-maintenance-clear-rejects', {
    logLevel: LogLevel.Warn,
    loggerProvider,
    storage: new RejectingStorage(),
  });

  client.clear();
  await Promise.resolve();
  await Promise.resolve();

  expect(loggerProvider.warn).toHaveBeenCalledWith(Error('storage failed'));
});

test('FetchHttpClient aborts timed out requests when AbortController exists', async () => {
  jest.useFakeTimers();
  const originalFetch = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = jest.fn(
    (_input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise<Response>(() => undefined);
    },
  ) as unknown as typeof globalThis.fetch;

  try {
    const requestPromise = FetchHttpClient.request(
      'https://example.com',
      'POST',
      {},
      '{}',
      100,
    );
    const timeoutExpectation = expect(requestPromise).rejects.toThrow(
      'Request timeout after 100 milliseconds',
    );
    await jest.advanceTimersByTimeAsync(100);

    await timeoutExpectation;
    expect(aborted).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ExperimentClient loads variants from legacy storage namespace', async () => {
  const deploymentKey = 'client-maintenance-legacy-cache';
  const storage = new MemoryStorage();
  await storage.put(
    `amp-exp-$default_instance-${deploymentKey.substring(
      deploymentKey.length - 6,
    )}`,
    JSON.stringify({
      legacy: { key: 'on', value: 'on' },
    }),
  );

  const client = new ExperimentClient(deploymentKey, { storage });
  await client.cacheReady();

  expect(client.variant('legacy')).toEqual({ key: 'on', value: 'on' });
});

test('variants options cache ignores malformed legacy storage values', async () => {
  const deploymentKey = 'client-maintenance-legacy-options';
  const instanceName = 'legacy-options';
  const storage = new MemoryStorage();
  await storage.put(
    `amp-exp-${instanceName}-${deploymentKey.substring(
      deploymentKey.length - 6,
    )}-variants-options`,
    '{invalid-json',
  );

  const cache = getVariantsOptionsStorage(deploymentKey, instanceName, storage);
  await cache.load();

  expect(cache.get()).toBeUndefined();
});

test('ExperimentClient.stop stops the default user provider lifecycle', () => {
  const stopSpy = jest.spyOn(DefaultUserProvider.prototype, 'stop');
  const client = new ExperimentClient(API_KEY, {
    userProvider: new AsyncUserProvider(),
  });

  client.stop();

  expect(stopSpy).toHaveBeenCalledTimes(1);
});

test('Experiment.initialize does not eagerly start the default user provider', () => {
  const startSpy = jest.spyOn(DefaultUserProvider.prototype, 'start');

  Experiment.initialize(API_KEY);

  expect(startSpy).not.toHaveBeenCalled();
});

test('ExperimentClient ignores invalid initialFlags payloads', () => {
  expect(() => {
    new ExperimentClient(API_KEY, {
      initialFlags: '{invalid-json',
    });
  }).not.toThrow();
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

test('Android context provider does not enable location by default before constructor init', () => {
  const contents = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'android/src/main/java/com/amplitude/experiment/reactnative/AndroidContextProvider.kt',
    ),
    'utf8',
  );

  expect(contents).toContain('var isLocationListening = locationListening');
  expect(contents).not.toContain('var isLocationListening = true');
});
