import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AskAnswer } from './AskAnswer';

const sources = [
  { title: 'Football culture today', url: 'https://www.example.org/football' },
  { title: 'Global profiles', url: 'https://profiles.example.com/people' },
];

describe('AskAnswer', () => {
  it('renders an answer as readable Markdown with a lead, headings, emphasis, and lists', () => {
    render(<AskAnswer sources={sources} answer={[
      '**Victoria Beckham** and **Georgina Rodríguez** are among the most recognizable names [1].',
      '## Names to know',
      '- **Victoria Beckham:** Widely recognized across fashion and football culture [1].\n- **Georgina Rodríguez:** A prominent contemporary public figure [2].',
      '### How popularity differs',
      '1. **Recognition:** Familiarity with the wider public.\n2. **Reach:** Visibility on social platforms.',
      '> There is no single official ranking.',
    ].join('\n\n')} />);

    const answer = screen.getByTestId('ask-answer-content');
    expect(within(answer).getByRole('heading', { name: 'Names to know' })).toBeInTheDocument();
    expect(within(answer).getByRole('heading', { name: 'How popularity differs' })).toBeInTheDocument();
    expect(within(answer).getAllByRole('listitem')).toHaveLength(4);
    expect(answer.querySelector('ul')).toHaveTextContent('Victoria Beckham:');
    expect(answer.querySelector('ol')).toHaveTextContent('Recognition:');
    expect(answer.querySelector('strong')).toHaveTextContent('Victoria Beckham');
    expect(answer.querySelector('blockquote')).toHaveTextContent('There is no single official ranking.');
    expect(answer).not.toHaveTextContent('##');
    expect(answer).not.toHaveTextContent('**');
  });

  it('keeps verified citation numbers aligned with their source cards, including rejected sources', () => {
    render(<AskAnswer
      answer={'A finding **with a citation [1]**.\n\n- Another finding [2][3]. An unresolved citation [9].'}
      sources={[sources[0], { title: 'Unsafe source', url: 'javascript:alert(1)' }, sources[1]]}
    />);

    expect(screen.getByRole('link', { name: 'Source 1: Football culture today' })).toHaveAttribute('href', sources[0].url);
    expect(screen.getByRole('link', { name: 'Source 3: Global profiles' })).toHaveAttribute('href', sources[1].url);
    expect(screen.getByTestId('ask-inline-citation-1')).toHaveTextContent('1');
    expect(screen.queryByTestId('ask-inline-citation-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ask-inline-citation-9')).not.toBeInTheDocument();
    expect(screen.getByTestId('ask-answer-content')).toHaveTextContent('[2]');
    expect(screen.getByTestId('ask-answer-content')).toHaveTextContent('[9]');
    const sourceCards = screen.getByTestId('ask-answer-sources');
    expect(within(sourceCards).getAllByRole('link')).toHaveLength(2);
    expect(within(sourceCards).getByRole('link', { name: '[3] Global profiles' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(sourceCards).toHaveTextContent('example.org');
    expect(sourceCards).toHaveTextContent('profiles.example.com');
    expect(sourceCards).not.toHaveTextContent('Unsafe source');
  });

  it('keeps evidence labels beside their original claims without flattening paragraphs', () => {
    render(<AskAnswer answer={'[KNOWN] Established finding. [INFERRED] A possible explanation.\n\n[SPECULATIVE] A future possibility.'} sources={[]} />);

    const known = screen.getByTestId('ask-evidence-known');
    const inferred = screen.getByTestId('ask-evidence-inferred');
    const speculative = screen.getByTestId('ask-evidence-speculative');
    expect(known.nextSibling?.textContent).toContain('Established finding.');
    expect(inferred.nextSibling?.textContent).toContain('A possible explanation.');
    expect(speculative.closest('p')).toHaveTextContent('A future possibility.');
    expect(speculative.closest('p')).not.toHaveTextContent('Established finding.');
    expect(screen.getByTestId('ask-answer-content')).not.toHaveTextContent('[KNOWN]');
    expect(screen.queryByTestId('ask-answer-sources')).not.toBeInTheDocument();
  });

  it('supports a comparison table and treats unverified links and HTML as inert content', () => {
    render(<AskAnswer answer={[
      '| Name | Recognition |\n| --- | --- |\n| Victoria | Fashion and football |',
      '[Unverified page](https://unverified.example.com) and [Bad link](javascript:alert(1))',
      '<script>alert("unsafe")</script>',
    ].join('\n\n')} sources={[]} />);

    expect(screen.getByRole('table')).toHaveTextContent('Fashion and football');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('ask-answer-content').querySelector('script')).toBeNull();
  });

  it('keeps unformatted legacy answers readable', () => {
    render(<AskAnswer answer={'First paragraph. Still the same thought.\n\nA second paragraph.'} sources={[]} />);
    const paragraphs = screen.getByTestId('ask-answer-content').querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('First paragraph. Still the same thought.');
    expect(paragraphs[1]).toHaveTextContent('A second paragraph.');
  });
});
