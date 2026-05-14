import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RECENT_RESULTS_MODES,
  clearRecentResults,
  saveRecentResult,
} from '../services/recent-results-storage';
import { RecentResultsLibrary } from './RecentResultsLibrary';

type MockResult = {
  id: string;
  title: string;
  description: string;
};

describe('RecentResultsLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders recently viewed items and handles item selection', () => {
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: '1',
      title: 'Result One',
      description: 'First description',
    });

    const onSelect = vi.fn();

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR}
        title="Recent Projects"
        onSelectItem={onSelect}
      />
    );

    expect(screen.getByText('Recent Projects')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('recent-result-item-1'));

    expect(onSelect).toHaveBeenCalledWith({
      id: '1',
      title: 'Result One',
      description: 'First description',
    });
  });

  it('clears mode history when clear button is clicked', () => {
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: '2',
      title: 'Result Two',
      description: 'Second description',
    });

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));

    expect(clearRecentResults).toBeDefined();
    expect(screen.queryByText('Result Two')).not.toBeInTheDocument();
    expect(screen.getByTestId('recent-results-clear-history-undo-toast')).toBeInTheDocument();
    expect(screen.getByTestId('undo-clear-recent-history')).toBeInTheDocument();
  });

  it('does not render when there are no recent projects', () => {
    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST}
        onSelectItem={vi.fn()}
      />
    );

    expect(screen.queryByTestId('recent-results-library')).not.toBeInTheDocument();
  });

  it('deletes an individual recent project and offers a 3-second undo', () => {
    vi.useFakeTimers();
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'a',
      title: 'Project A',
      description: 'A description',
    });
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'b',
      title: 'Project B',
      description: 'B description',
    });

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('delete-recent-result-a'));

    expect(screen.queryByTestId('recent-result-item-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('undo-delete-recent-result-a')).toBeInTheDocument();
    expect(screen.getByTestId('recent-results-undo-toast')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('undo-delete-recent-result-a'));

    expect(screen.getByTestId('recent-result-item-a')).toBeInTheDocument();
    expect(screen.queryByTestId('undo-delete-recent-result-a')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('finalizes individual deletion when undo window expires', () => {
    vi.useFakeTimers();
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST, {
      id: 'x',
      title: 'Project X',
      description: 'X description',
    });

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.CULTURAL_ARCHAEOLOGIST}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('delete-recent-result-x'));
    expect(screen.queryByTestId('recent-result-item-x')).not.toBeInTheDocument();
    expect(screen.getByTestId('recent-results-live-region')).toHaveTextContent('1 recent project deletions pending undo.');
    expect(screen.getByTestId('recent-results-undo-toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('recent-results-undo-toast')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-result-item-x')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-results-library')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('undoes clear history within 3 seconds', () => {
    vi.useFakeTimers();
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR, {
      id: 'h1',
      title: 'History One',
      description: 'One description',
    });

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.DESIGN_EXCAVATOR}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('clear-recent-history'));
    expect(screen.queryByTestId('recent-result-item-h1')).not.toBeInTheDocument();
    expect(screen.getByTestId('undo-clear-recent-history')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('undo-clear-recent-history'));
    expect(screen.getByTestId('recent-result-item-h1')).toBeInTheDocument();
    expect(screen.queryByTestId('recent-results-clear-history-undo-toast')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('finalizes clear history deletion when undo window expires', () => {
    vi.useFakeTimers();
    saveRecentResult<MockResult>(APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR, {
      id: 'h2',
      title: 'History Two',
      description: 'Two description',
    });

    render(
      <RecentResultsLibrary<MockResult>
        mode={APP_RECENT_RESULTS_MODES.BRAND_NAVIGATOR}
        onSelectItem={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('clear-recent-history'));
    expect(screen.getByTestId('recent-results-clear-history-undo-toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('recent-results-clear-history-undo-toast')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-results-library')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
