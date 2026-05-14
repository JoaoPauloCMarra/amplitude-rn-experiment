# amplitude-rn-experiment

Storage-agnostic React Native Experiment client compatible with Amplitude services.

This package builds on the original Amplitude React Native Experiment client
with a smaller default dependency surface, stronger lifecycle cleanup, and
modern React Native compatibility fixes.

Key improvements over the original package:

- no hard runtime dependency on `@react-native-async-storage/async-storage`
- built-in shared memory storage fallback for development and tests
- preserved custom `storage` hook for apps that want persistent storage
- React Native new-architecture support fixes for Android and iOS
- Android compatibility fixes for modern Gradle and React Native toolchains
- safer async handling for initialization, polling, retries, and fetch failures
- cleanup for retry timers, polling timers, and Amplitude identity listeners
- cache namespace isolation so projects using different deployment keys do not
  collide
- defensive cache parsing for malformed persisted values
- deterministic tests covering lifecycle, storage, and async failure paths

## Install

```sh
npm install amplitude-rn-experiment
```

## Default storage behavior

If you initialize the client without a `storage` implementation, the SDK uses
built-in in-memory storage for cached variants and flag data.

That is fine for tests and development.

Do not ship the memory fallback as your production storage strategy if you want
cached variants or flag state to survive app restarts.

## Usage

```ts
import { Experiment } from 'amplitude-rn-experiment';

const client = Experiment.initialize(DEPLOYMENT_KEY);
await client.fetch({ user_id: 'user-1' });
```

## Custom storage

Pass a custom storage implementation to persist variants and flags:

```ts
type Storage = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  reset?(): Promise<void>;
};
```

## Nitro storage example

```ts
import { Experiment } from 'amplitude-rn-experiment';
import { storage, StorageScope } from 'react-native-nitro-storage';

const experimentStorage = {
  async get(key) {
    return storage.getString(key, StorageScope.Disk) ?? null;
  },
  async put(key, value) {
    storage.setString(key, value, StorageScope.Disk);
  },
  async delete(key) {
    storage.deleteString(key, StorageScope.Disk);
  },
};

const client = Experiment.initialize(DEPLOYMENT_KEY, {
  storage: experimentStorage,
});
```

## Exports

- `LocalStorage`
- `MemoryStorage`

Both names point to the built-in shared in-memory storage implementation in
this fork.

## Upstream compatibility

The public Experiment API stays close to the upstream React Native client. The
main behavioral difference is the default storage backend: this fork defaults
to memory instead of AsyncStorage.

Additional fork-only maintenance includes:

- safe dependency updates for Amplitude connector and Experiment core packages
- concurrent fetch response ordering protection
- explicit logger injection support
- guarded clear and persistence writes so storage errors are logged instead of
  becoming unhandled promises
- retry and polling cleanup to avoid dangling timers after `stop()`
- Amplitude identity listener cleanup after `stop()`
- user-session exposure cache invalidation on identity change
- example app updates for fewer rerenders, safer unmount handling, and direct
  AsyncStorage autolinking for the analytics example dependency

## Fork lineage

- upstream base: `@amplitude/experiment-react-native-client@1.8.0`
- fork package version: `amplitude-rn-experiment@1.8.10`

## Maintenance policy

This package is maintained as an active fork, not a one-off patch release.

- upstream changes should be reviewed regularly for compatibility and bug fixes
- native compatibility regressions should be validated against the example apps
- storage behavior should remain dependency-free by default and persistence
  should stay opt-in via custom `storage`

## Validation matrix

| Surface | Verified |
| --- | --- |
| Upstream Experiment API shape | close to `@amplitude/experiment-react-native-client@1.8.0` |
| Package build | `bob build` |
| TypeScript | `tsc --noEmit` |
| Lint | `eslint "**/*.{ts,tsx}"` |
| Built-in memory storage | regression tests |
| Custom `storage` | regression tests |
| Stop lifecycle cleanup | regression tests |
| Retry and polling cleanup | regression tests |
| Cache namespace isolation | regression tests |
| Async failure handling | regression tests |
| Android manifest permission surface | regression tests |
| Android example app | clean emulator build and runtime log scan |
| iOS example app | clean simulator build and runtime log scan |
