export type AppErrorKind = 'quota' | 'network' | 'validation' | 'unknown';

export type AppError = {
  kind: AppErrorKind;
  message: string;
  isRecoverable: boolean;
};

const NETWORK_PATTERNS = [
  /network/i,
  /failed to fetch/i,
  /timeout/i,
  /ecconnreset/i,
  /eai_again/i,
];

const VALIDATION_PATTERNS = [
  /invalid/i,
  /missing/i,
  /required/i,
  /unsupported/i,
  /malformed/i,
];

export const normalizeAppError = (error: unknown): AppError => {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('429') ||
    normalizedMessage.includes('quota') ||
    normalizedMessage.includes('resource_exhausted')
  ) {
    return {
      kind: 'quota',
      message: 'You exceeded your current API quota. Please check your plan and billing details.',
      isRecoverable: true,
    };
  }

  if (NETWORK_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      kind: 'network',
      message: 'Network issue detected. Please check your connection and try again.',
      isRecoverable: true,
    };
  }

  if (VALIDATION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      kind: 'validation',
      message: 'Some inputs are invalid or incomplete. Please review and try again.',
      isRecoverable: true,
    };
  }

  return {
    kind: 'unknown',
    message: 'Something went wrong. Please try again.',
    isRecoverable: true,
  };
};
