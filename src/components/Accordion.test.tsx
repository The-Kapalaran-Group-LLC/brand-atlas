import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compile } from 'tailwindcss';
import { Accordion } from './Accordion';

describe('Accordion', () => {
  const items = [
    { id: 'one', title: 'First Section', content: <p>First content</p> },
    { id: 'two', title: 'Second Section', content: <p>Second content</p> },
    { id: 'three', title: 'Third Section', content: <p>Third content</p> },
  ];

  it('opens only the first section by default', () => {
    render(<Accordion items={items} />);

    expect(screen.getByText('First content')).toBeInTheDocument();
    expect(screen.getByText('Second content')).not.toBeVisible();
    expect(screen.getByText('Third content')).not.toBeVisible();
  });

  it('toggles sections and keeps only one open at a time', () => {
    render(<Accordion items={items} />);

    fireEvent.click(screen.getByRole('button', { name: /second section/i }));
    expect(screen.getByText('Second content')).toBeInTheDocument();
    expect(screen.getByText('First content')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /second section/i }));
    expect(screen.getByText('Second content')).not.toBeVisible();
  });

  it('keeps category toggles interactive when app heading styles disable pointer events', async () => {
    const style = document.createElement('style');
    const appStyles = readFileSync('src/index.css', 'utf8');
    const utilities = await compile('@tailwind utilities;');
    style.textContent = `${appStyles}\n${utilities.build(['pointer-events-auto'])}`;
    document.head.append(style);

    try {
      render(<Accordion items={items} />);
      const toggle = screen.getByRole('button', { name: /second section/i });

      expect(getComputedStyle(toggle.closest('h4')!).pointerEvents).toBe('none');
      expect(getComputedStyle(toggle).pointerEvents).toBe('auto');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Second content')).toBeVisible();
    } finally {
      style.remove();
    }
  });
});
