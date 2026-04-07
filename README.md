# amplitude-rn-experiment

Storage-agnostic React Native Experiment client compatible with Amplitude services.

This fork removes the hard dependency on `@react-native-async-storage/async-storage`.
It ships with a built-in shared memory storage fallback and keeps the upstream
custom `storage` hook so apps can inject persistent storage.

## Install

```sh
bun add amplitude-rn-experiment
```

## Default storage behavior

If you initialize the client without a `storage` implementation, the SDK uses
built-in in-memory storage for cached variants and flag data.

That is fine for tests and development. It is not the recommended production
setup if you want cached variants or flag state to survive app restarts.

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
