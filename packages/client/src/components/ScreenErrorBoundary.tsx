import { Component } from 'react';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  screenName: string;
  onReset?: () => void;
};

type State = { error: Error | null };

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-game-bg flex items-center justify-center p-6">
          <div className="bg-game-surface border border-red-500/30 rounded-2xl p-8 max-w-sm w-full text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-red-400 font-bold text-lg mb-1">Error en {this.props.screenName}</h2>
            <p className="text-text-secondary text-sm mb-6">{this.state.error.message}</p>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full bg-game-gold text-game-bg font-bold py-2.5 rounded-xl hover:brightness-110 transition-all text-sm"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
