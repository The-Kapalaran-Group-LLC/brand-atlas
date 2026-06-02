import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackChatWidget } from './FeedbackChatWidget';

vi.mock('../api/submitFeedbackToSupabase', () => ({
  submitFeedbackToSupabase: vi.fn(),
}));

describe('FeedbackChatWidget', () => {
  it('shows a hamburger quick action and triggers admin navigation when enabled', async () => {
    const onAdminNavigate = vi.fn();

    render(
      <FeedbackChatWidget
        showAdminShortcut
        adminHref="/#admin"
        onAdminNavigate={onAdminNavigate}
      />
    );

    const trigger = await screen.findByTestId('feedback-admin-menu-trigger');
    fireEvent.click(trigger);

    expect(await screen.findByTestId('feedback-admin-menu-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('feedback-admin-menu-admin-link'));

    expect(onAdminNavigate).toHaveBeenCalledTimes(1);
  });

  it('does not render the admin hamburger when shortcut is disabled', () => {
    render(<FeedbackChatWidget />);

    expect(screen.queryByTestId('feedback-admin-menu-trigger')).not.toBeInTheDocument();
  });

  it('right aligns the action buttons to the feedback panel width while the panel is open', () => {
    render(<FeedbackChatWidget showAdminShortcut />);

    const actionsRow = screen.getByTestId('feedback-widget-actions');
    expect(actionsRow.className).not.toContain('w-[min(92vw,24rem)]');

    const toggle = screen.getByTestId('feedback-widget-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(actionsRow.className).toContain('w-[min(92vw,24rem)]');
    expect(actionsRow.className).toContain('justify-end');
  });
});
