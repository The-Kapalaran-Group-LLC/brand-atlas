import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootRouter } from './main';

const { resolveRootViewMock } = vi.hoisted(() => ({
  resolveRootViewMock: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}));

vi.mock('./App.tsx', () => ({
  default: () => <div data-testid="root-view-app">App Root</div>,
}));

vi.mock('./components/BrandNavigator.tsx', () => ({
  default: () => <div data-testid="root-view-brand">Brand Root</div>,
}));

vi.mock('./components/PrivacyPolicy.tsx', () => ({
  default: () => <div data-testid="root-view-privacy">Privacy Policy</div>,
}));

vi.mock('./services/navigation-routes', () => ({
  resolveRootView: resolveRootViewMock,
}));

describe('RootRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts only the app root when root view is not brand navigator', () => {
    resolveRootViewMock.mockReturnValue('app');

    render(<RootRouter />);

    expect(screen.getByTestId('root-view-app')).toBeInTheDocument();
    expect(screen.queryByTestId('root-view-brand')).not.toBeInTheDocument();
    expect(screen.queryByTestId('root-view-privacy')).not.toBeInTheDocument();
  });
});
