import { describe, expect, it, vi } from 'vitest';
import { runUserAction } from './user-actions';

describe('runUserAction', () => {
  it('returns successful action result', async () => {
    const result = await runUserAction({
      actionName: 'test-success',
      action: async () => 'ok',
    });

    expect(result).toBe('ok');
  });

  it('calls onError and rethrows failure', async () => {
    const onError = vi.fn();

    await expect(
      runUserAction({
        actionName: 'test-failure',
        action: async () => {
          throw new Error('Failed to fetch');
        },
        onError,
      })
    ).rejects.toThrow('Failed to fetch');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ kind: 'network' });
  });
});

