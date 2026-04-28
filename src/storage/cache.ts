import { EvaluationFlag, GetVariantsOptions } from '@amplitude/experiment-core';

import { Storage } from '../types/storage';
import { Variant } from '../types/variant';

export const getVariantStorage = (
  deploymentKey: string,
  instanceName: string,
  storage: Storage,
): LoadStoreCache<Variant> => {
  const truncatedDeployment = deploymentKey.substring(deploymentKey.length - 6);
  const namespace = `amp-exp-${instanceName}-${truncatedDeployment}`;
  return new LoadStoreCache<Variant>(
    namespace,
    storage,
    transformVariantFromStorage,
  );
};

export const getFlagStorage = (
  deploymentKey: string,
  instanceName: string,
  storage: Storage,
): LoadStoreCache<EvaluationFlag> => {
  const truncatedDeployment = deploymentKey.substring(deploymentKey.length - 6);
  const namespace = `amp-exp-${instanceName}-${truncatedDeployment}-flags`;
  return new LoadStoreCache<EvaluationFlag>(namespace, storage);
};

export const getVariantsOptionsStorage = (
  deploymentKey: string,
  instanceName: string,
  storage: Storage,
): SingleValueStoreCache<GetVariantsOptions> => {
  const truncatedDeployment = deploymentKey.substring(deploymentKey.length - 6);
  const namespace = `amp-exp-${instanceName}-${truncatedDeployment}-variants-options`;
  return new SingleValueStoreCache<GetVariantsOptions>(namespace, storage);
};

export class SingleValueStoreCache<V> {
  private readonly namespace: string;
  private readonly storage: Storage;
  private value: V | undefined;

  constructor(namespace: string, storage: Storage) {
    this.namespace = namespace;
    this.storage = storage;
    this.value = this.get();
  }

  public get(): V | undefined {
    return this.value;
  }

  public put(value: V): void {
    this.value = value;
  }

  public async load(): Promise<void> {
    const value = await this.storage.get(this.namespace);
    if (value) {
      this.value = JSON.parse(value);
    }
  }

  public async store(): Promise<void> {
    if (this.value === undefined) {
      // Delete the key if the value is undefined
      await this.storage.delete(this.namespace);
    } else {
      // Also store false or null values
      await this.storage.put(this.namespace, JSON.stringify(this.value));
    }
  }
}

export class LoadStoreCache<V> {
  private readonly namespace: string;
  private readonly storage: Storage;
  private readonly transformer?: (value: unknown) => V | undefined;
  private cache: Record<string, V> = {};

  constructor(
    namespace: string,
    storage: Storage,
    transformer?: (value: unknown) => V | undefined,
  ) {
    this.namespace = namespace;
    this.storage = storage;
    this.transformer = transformer;
  }

  public get(key: string): V | undefined {
    return this.cache[key];
  }

  public getAll(): Record<string, V> {
    return { ...this.cache };
  }

  public put(key: string, value: V): void {
    this.cache[key] = value;
  }

  public putAll(values: Record<string, V>): void {
    for (const key of Object.keys(values)) {
      this.cache[key] = values[key];
    }
  }

  public remove(key: string): void {
    delete this.cache[key];
  }

  public clear(): void {
    this.cache = {};
  }

  public async load(initialValues?: Record<string, V>): Promise<void> {
    const rawValues = await this.storage.get(this.namespace);
    let jsonValues: Record<string, unknown> = {};
    if (!rawValues) {
      this.clear();
      if (initialValues) {
        this.putAll(initialValues);
      }
      return;
    }
    try {
      jsonValues = (JSON.parse(rawValues) as Record<string, unknown>) || {};
    } catch {
      this.clear();
      if (initialValues) {
        this.putAll(initialValues);
      }
      return;
    }
    const values: Record<string, V> = {};
    for (const key of Object.keys(jsonValues)) {
      try {
        const value = this.transformer
          ? this.transformer(jsonValues[key])
          : (jsonValues[key] as V);
        if (value !== undefined) {
          values[key] = value;
        }
      } catch {
        // Do nothing
      }
    }
    this.clear();
    if (initialValues) {
      this.putAll(initialValues);
    }
    this.putAll(values);
  }

  public async store(values: Record<string, V> = this.cache): Promise<void> {
    await this.storage.put(this.namespace, JSON.stringify(values));
  }
}

export const transformVariantFromStorage = (
  storageValue: unknown,
): Variant | undefined => {
  if (typeof storageValue === 'string') {
    // From v0 string format
    return {
      key: storageValue,
      value: storageValue,
    };
  } else if (typeof storageValue === 'object' && storageValue !== null) {
    // From v1 or v2 object format
    const variantRecord = storageValue as Record<string, unknown>;
    const key = variantRecord.key;
    const value = variantRecord.value;
    const payload = variantRecord.payload;
    const rawMetadata = variantRecord.metadata;
    let metadata =
      rawMetadata && typeof rawMetadata === 'object'
        ? ({ ...rawMetadata } as Record<string, unknown>)
        : undefined;
    let experimentKey =
      typeof variantRecord.expKey === 'string'
        ? variantRecord.expKey
        : undefined;
    const metadataExperimentKey =
      metadata && typeof metadata.experimentKey === 'string'
        ? metadata.experimentKey
        : undefined;

    if (metadataExperimentKey) {
      experimentKey = metadataExperimentKey;
    } else if (experimentKey) {
      metadata = metadata || {};
      metadata.experimentKey = experimentKey;
    }
    const variant: Variant = {};
    if (typeof key === 'string') {
      variant.key = key;
    } else if (typeof value === 'string') {
      variant.key = value;
    }
    if (typeof value === 'string') variant.value = value;
    if (metadata) variant.metadata = metadata;
    if (payload) variant.payload = payload;
    if (experimentKey) variant.expKey = experimentKey;
    return variant;
  }
  return undefined;
};
