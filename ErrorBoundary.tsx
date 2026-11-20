import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Непредвиденная ошибка интерфейса.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100">
          <div className="liquid-glass-elevated max-w-md w-full rounded-3xl p-6 space-y-4 text-center">
            <h1 className="font-display text-lg font-bold">Произошёл сбой интерфейса</h1>
            <p className="text-xs text-slate-300 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
