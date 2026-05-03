import { normalizeAppError, type AppError } from './api-errors';
import { logger } from './logger';

type RunUserActionParams<T> = {
  actionName: string;
  actionId?: string;
  action: () => Promise<T>;
  onError?: (error: AppError) => void;
};

export const buildActionId = (prefix: string): string => `${prefix}-${Date.now()}`;

export async function runUserAction<T>(params: RunUserActionParams<T>): Promise<T> {
  const actionId = params.actionId || buildActionId(params.actionName);
  logger.info(`${params.actionName} started`, { actionId });
  try {
    const result = await params.action();
    logger.info(`${params.actionName} succeeded`, { actionId });
    return result;
  } catch (error) {
    const normalized = normalizeAppError(error);
    logger.error(`${params.actionName} failed`, {
      actionId,
      error,
      normalized,
    });
    if (params.onError) {
      params.onError(normalized);
    }
    throw error;
  }
}
