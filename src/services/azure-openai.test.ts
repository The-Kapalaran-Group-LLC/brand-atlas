import { describe, expect, it } from 'vitest';
import {
  formatDevilsAdvocateLens,
  getDeploymentCandidatesFromEnv,
  shouldRetryWithAlternateDeployment,
} from './azure-openai';

describe('formatDevilsAdvocateLens', () => {
  it('uses consolidated summary when provided', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: 'Long counter argument that is intentionally verbose.',
      keyWeaknesses: ['Weakness one', 'Weakness two'],
      consolidatedSummary: 'Tight summary preserving all core claims and risks.',
    });

    expect(result).toBe('Tight summary preserving all core claims and risks.');
  });

  it('falls back to counter argument when consolidated summary is empty', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: 'Counter argument fallback text.',
      keyWeaknesses: ['Weakness one'],
      consolidatedSummary: '   ',
    });

    expect(result).toBe('Counter argument fallback text.');
  });

  it('returns a friendly fallback when no lens text is available', () => {
    const result = formatDevilsAdvocateLens({
      counterArgument: '   ',
      keyWeaknesses: [],
      consolidatedSummary: '',
    });

    expect(result).toBe('Alternative interpretation not available.');
  });
});

describe('deployment fallback helpers', () => {
  it('builds unique deployment candidates in priority order', () => {
    const candidates = getDeploymentCandidatesFromEnv({
      AZURE_OPENAI_PRIMARY_DEPLOYMENT_NAME: 'gpt-5.4',
      AZURE_OPENAI_DEPLOYMENT_NAME: 'gpt-5.4-mini',
      AZURE_OPENAI_FALLBACK_DEPLOYMENT_NAME: 'gpt-4o-mini',
    } as NodeJS.ProcessEnv);

    expect(candidates).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini', 'gpt-4o']);
  });

  it('recognizes invalid_prompt as retryable on an alternate deployment', () => {
    const shouldRetry = shouldRetryWithAlternateDeployment({
      status: 400,
      code: 'invalid_prompt',
      message: 'Invalid prompt',
    });

    expect(shouldRetry).toBe(true);
  });

  it('does not retry validation style client errors', () => {
    const shouldRetry = shouldRetryWithAlternateDeployment({
      status: 400,
      code: 'unsupported_parameter',
      message: 'Unsupported parameter',
    });

    expect(shouldRetry).toBe(false);
  });
});
