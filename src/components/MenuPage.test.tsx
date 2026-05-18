import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Search } from 'lucide-react';
import MenuPage, { type MenuPageCard } from './MenuPage';

const { splashGridSpy } = vi.hoisted(() => ({
  splashGridSpy: vi.fn(),
}));

vi.mock('./SplashGrid', () => ({
  SplashGrid: (props: Record<string, unknown>) => {
    splashGridSpy(props);
    return <div data-testid="menu-page-globe" />;
  },
}));

describe('MenuPage', () => {
  it('renders cards and routes click actions through handlers', () => {
    const onFirstClick = vi.fn();
    const onSecondClick = vi.fn();

    const cards: MenuPageCard[] = [
      {
        id: 'cultural-archaeologist',
        title: 'Cultural Archaeologist',
        description: 'Generate sharper insights.',
        bullets: ['Audience research'],
        icon: <Search className="w-4 h-4" />,
        onClick: onFirstClick,
      },
      {
        id: 'design-excavator',
        title: 'Design Excavator',
        description: 'Compare design systems.',
        bullets: ['Competitive research'],
        icon: <Search className="w-4 h-4" />,
        onClick: onSecondClick,
        badgeText: 'Beta',
      },
    ];

    render(
      <MenuPage
        subtitle="Start with cultural research."
        cards={cards}
        sectionClassName="max-w-6xl"
        cardsGridClassName="grid grid-cols-1 md:grid-cols-2 gap-8 items-start"
      />
    );

    expect(screen.getByTestId('menu-page')).toBeInTheDocument();
    expect(screen.getByTestId('menu-page-globe')).toBeInTheDocument();
    expect(screen.getByText('Choose Your Research Experience')).toBeInTheDocument();
    expect(screen.getByText('Start with cultural research.')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(splashGridSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sizeMultiplier: 1.25,
        qualityMode: 'fast',
        startLongitude: -74.006,
      })
    );

    fireEvent.click(screen.getByTestId('menu-page-card-cultural-archaeologist'));
    fireEvent.click(screen.getByTestId('menu-page-card-design-excavator'));

    expect(onFirstClick).toHaveBeenCalledTimes(1);
    expect(onSecondClick).toHaveBeenCalledTimes(1);
  });
});
