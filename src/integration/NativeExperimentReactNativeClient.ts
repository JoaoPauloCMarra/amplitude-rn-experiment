import { NativeModules } from 'react-native';

export interface Spec {
  getApplicationContext(): Promise<{
    version?: string;
    platform?: string;
    language?: string;
    os?: string;
    device_brand?: string;
    device_manufacturer?: string;
    device_model?: string;
    carrier?: string;
  }>;
}

export default NativeModules.ExperimentReactNativeClient as
  | Spec
  | undefined
  | null;
