import React from 'react';

type SectionErrorBoundaryProps = {
  title?: string;
  children: React.ReactNode;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[SectionErrorBoundary] Caught UI error', {
      title: this.props.title,
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left">
        <p className="text-sm font-semibold text-amber-800">
          {this.props.title || 'Section'} temporarily unavailable.
        </p>
        <p className="text-xs text-amber-700 mt-1">
          {this.state.message || 'An unexpected issue occurred while rendering this area.'}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ hasError: false, message: '' })}
          className="mt-3 inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          Retry Section
        </button>
      </div>
    );
  }
}
