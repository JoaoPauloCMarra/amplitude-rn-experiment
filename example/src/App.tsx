import {
  Experiment,
  Variant,
  Variants,
} from 'amplitude-rn-experiment';
import { init, track } from '@amplitude/analytics-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';

type ExperimentState = {
  variant?: Variant;
  fallbackResult?: Variant;
  variantFallbackResult?: Variant;
  payloadVariant?: Variant;
  allVariants?: Variants;
  error?: string;
};

export default function App() {
  const [state, setState] = useState<ExperimentState>({});

  useEffect(() => {
    let cancelled = false;
    const experiment = Experiment.initializeWithAmplitudeAnalytics(
      'client-IAxMYws9vVQESrrK88aTcToyqMxiiJoR',
      {
        debug: true,
        fallbackVariant: { value: 'defaultFallback' },
      },
    );

    const loadExperiment = async () => {
      try {
        await init('a6dd847b9d2f03c816d4f3f8458cdc1d', 'briang123').promise;
        await track('test').promise;
        await experiment.fetch({
          user_properties: { test: 'true', test2: 4.3 },
        });
        const variantFallbackResult = experiment.variant(
          'flag-does-not-exist',
          {
            value: 'fallback',
            payload: {
              list: [1, 2],
              map: { key: 'value' },
              boolean: true,
              int: 1,
              number: 2.2,
              string: 'string',
            },
          },
        );
        if (!cancelled) {
          setState({
            variant: experiment.variant('react-native'),
            fallbackResult: experiment.variant('flag-does-not-exist'),
            variantFallbackResult,
            payloadVariant: experiment.variant('android-demo'),
            allVariants: experiment.all(),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
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
      cancelled = true;
      experiment.stop();
    };
  }, []);

  return (
    <View style={styles.container}>
      {state.error ? <Text style={styles.text}>{state.error}</Text> : null}
      <Text style={styles.text}>
        react-native: {JSON.stringify(state.variant)}
      </Text>
      <Text style={styles.text}>
        'flag-does-not-exist' with no fallback:{' '}
        {JSON.stringify(state.fallbackResult)}
      </Text>
      <Text style={styles.text}>
        'flag-does-not-exist' with variant fallback:{' '}
        {JSON.stringify(state.variantFallbackResult)}
      </Text>
      <Text style={styles.text}>
        variant-with-payload: {JSON.stringify(state.payloadVariant)}
      </Text>
      <Text style={styles.text}>
        all variants: {JSON.stringify(state.allVariants)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  text: {
    marginVertical: 20,
  },
});
