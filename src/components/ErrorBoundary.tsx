import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('yesdhobi_registration_data');
      localStorage.removeItem('yesdhobi_registration_step');
    } catch (e) {
      console.warn('Failed to clear storage:', e);
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div>
              <h2 className="text-xl font-bold text-slate-900">Something went wrong</h2>
              <p className="text-xs text-slate-500 mt-1">
                We encountered an unexpected display issue. Your registration session has been preserved safely.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 rounded-xl p-3 text-left border border-slate-200 text-xs text-slate-600 font-mono overflow-auto max-h-28">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
