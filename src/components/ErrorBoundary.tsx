import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/#/";
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-surface-container-lowest p-6 text-on-surface">
          <div className="max-w-lg w-full bg-surface border border-outline-variant rounded-2xl p-8 shadow-xl text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-error/10 text-error flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px]">error</span>
            </div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-xs text-secondary mb-4 leading-relaxed">
              An unexpected interface error occurred. You can reload the page or return to the main dashboard.
            </p>
            {this.state.error && (
              <div className="w-full bg-surface-container-low border border-outline-variant p-3 rounded-xl mb-6 text-left overflow-auto max-h-40">
                <p className="text-[11px] font-mono text-error font-medium break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={this.handleReload}
                className="btn-primary flex-1 sm:flex-initial"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Reload App</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="btn-secondary flex-1 sm:flex-initial"
              >
                <span className="material-symbols-outlined text-[18px]">home</span>
                <span>Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
