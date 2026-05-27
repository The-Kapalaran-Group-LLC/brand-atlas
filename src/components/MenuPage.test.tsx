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
  it('renders cards as links and routes primary clicks through handlers', () => {
    const onFirstClick = vi.fn();
    const onSecondClick = vi.fn();

    const cards: MenuPageCard[] = [
      {
        id: 'cultural-archaeologist',
        title: 'Cultural Archaeologist',
        description: 'Generate sharper insights.',
        bullets: ['Audience research'],
        icon: <Search className="w-4 h-4" />,
        href: '/#cultural-archaeologist',
        onClick: onFirstClick,
      },
      {
        id: 'design-excavator',
        title: 'Design Excavator',
        description: 'Compare design systems.',
        bullets: ['Competitive research'],
        icon: <Search className="w-4 h-4" />,
        href: '/#design-excavator',
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

    const firstCardLink = screen.getByRole('link', { name: /cultural archaeologist/i });
    const secondCardLink = screen.getByRole('link', { name: /design excavator/i });

    expect(firstCardLink).toHaveAttribute('href', '/#cultural-archaeologist');
    expect(secondCardLink).toHaveAttribute('href', '/#design-excavator');

    fireEvent.click(firstCardLink);
    fireEvent.click(secondCardLink);

    expect(onFirstClick).toHaveBeenCalledTimes(1);
    expect(onSecondClick).toHaveBeenCalledTimes(1);
  });

  it('keeps default browser link behavior for modified clicks', () => {
    const onClick = vi.fn();

    const cards: MenuPageCard[] = [
      {
        id: 'brand-navigator',
        title: 'Brand Navigator',
        description: 'Audit multiple brands.',
        bullets: ['Opportunity space identification'],
        icon: <Search className="w-4 h-4" />,
        href: '/#brand-navigator',
        onClick,
      },
    ];

    render(
      <MenuPage
        subtitle="Start with cultural research."
        cards={cards}
      />
    );

    const cardLink = screen.getByRole('link', { name: /brand navigator/i });

    fireEvent.click(cardLink, { metaKey: true });
    fireEvent.click(cardLink, { ctrlKey: true });

    expect(onClick).not.toHaveBeenCalled();
  });
});
