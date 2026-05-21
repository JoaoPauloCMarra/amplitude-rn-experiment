import {
  Experiment,
  LogLevel,
  Variant,
  Variants,
} from 'amplitude-rn-experiment';
import { init, track } from '@amplitude/analytics-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

const deploymentKey = 'client-IAxMYws9vVQESrrK88aTcToyqMxiiJoR';
const analyticsKey = 'a6dd847b9d2f03c816d4f3f8458cdc1d';
const fallbackVariant: Variant = { value: 'defaultFallback' };
const missingFlagFallback: Variant = {
  value: 'fallback',
  payload: {
    list: [1, 2],
    map: { key: 'value' },
    boolean: true,
    int: 1,
    number: 2.2,
    string: 'string',
  },
};

type ExperimentState = {
  loading: boolean;
  variant?: Variant;
  fallbackResult?: Variant;
  variantFallbackResult?: Variant;
  payloadVariant?: Variant;
  allVariants?: Variants;
  error?: string;
};

export default function App() {
  const [state, setState] = useState<ExperimentState>({ loading: true });

  useEffect(() => {
    let mounted = true;
    const experiment = Experiment.initializeWithAmplitudeAnalytics(deploymentKey, {
      fallbackVariant,
      logLevel: LogLevel.Disable,
    });

    const loadExperiment = async () => {
      try {
        await init(analyticsKey, 'briang123').promise;
        await track('test').promise;
        await experiment.fetch({
          user_properties: { test: 'true', test2: 4.3 },
        });
        const variantFallbackResult = experiment.variant(
          'flag-does-not-exist',
          missingFlagFallback,
        );
        if (mounted) {
          setState({
            loading: false,
            variant: experiment.variant('react-native'),
            fallbackResult: experiment.variant('flag-does-not-exist'),
            variantFallbackResult,
            payloadVariant: experiment.variant('android-demo'),
            allVariants: experiment.all(),
          });
        }
      } catch (error) {
        if (mounted) {
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load experiment',
          });
        }
      }
    };

    void loadExperiment();

    return () => {
      mounted = false;
      experiment.stop();
    };
  }, []);

  const rows = [
    { label: 'react-native', value: state.variant },
    { label: 'flag-does-not-exist', value: state.fallbackResult },
    {
      label: 'flag-does-not-exist with variant fallback',
      value: state.variantFallbackResult,
    },
    { label: 'variant-with-payload', value: state.payloadVariant },
    { label: 'all variants', value: state.allVariants },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Amplitude Experiment</Text>
      {state.loading ? <Text style={styles.text}>Loading variants...</Text> : null}
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      {rows.map(({ label, value }) => (
        <Text key={label} style={styles.text}>
          {label}: {JSON.stringify(value)}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'flex-start',
    gap: 16,
    justifyContent: 'flex-start',
    padding: 24,
    paddingTop: 72,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  error: {
    color: '#B00020',
    fontSize: 16,
  },
  text: {
    fontSize: 16,
  },
});
