import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /**
   * "app" fills the window (used at the root); "page" renders inside the layout so
   * the sidebar stays usable when a single screen crashes.
   */
  variant?: "app" | "page";
  /** When this value changes (e.g. the route), a crashed boundary resets itself. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: "",
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Kept for IT troubleshooting; the user sees the recovery screen below.
    console.error("Uncaught React error:", error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack ?? "" });
  }

  public componentDidUpdate(previous: Props) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, componentStack: "" });
    }
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false, error: null, componentStack: "" });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.hash = "#/";
    if (this.props.variant === "page") {
      this.handleTryAgain();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    const isPage = this.props.variant === "page";
    const technical = [this.state.error?.toString(), this.state.componentStack.trim()].filter(Boolean).join("\n");

    return (
      <div
        className={`${isPage ? "min-h-[60vh]" : "min-h-screen bg-surface-container-lowest"} w-full flex items-center justify-center p-6 text-on-surface`}
      >
        <div
          role="alert"
          className="max-w-lg w-full bg-surface dark:bg-surface-container border border-outline-variant rounded-2xl p-8 shadow-xl text-center flex flex-col items-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-error/10 text-error flex items-center justify-center mb-4" aria-hidden="true">
            <span className="material-symbols-outlined text-[32px]">error</span>
          </div>
          <h1 className="text-xl font-bold mb-2">Something went wrong on this screen</h1>
          <p className="text-sm text-secondary mb-2 leading-relaxed">
            An unexpected display error occurred. Your saved records are not affected.
          </p>
          <p className="text-sm text-secondary mb-4 leading-relaxed">
            Try again, return to the dashboard, or reload the app. If it keeps happening, share the technical details with school IT support.
          </p>
          {technical && (
            <details className="w-full mb-6 text-left rounded-xl border border-outline-variant bg-surface-container-low">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-secondary">Technical details</summary>
              <pre className="px-3 pb-3 text-[11px] font-mono text-error whitespace-pre-wrap break-all max-h-40 overflow-auto">{technical}</pre>
            </details>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
            {isPage && (
              <button type="button" onClick={this.handleTryAgain} className="btn-primary flex-1 sm:flex-initial">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
                <span>Try Again</span>
              </button>
            )}
            <button type="button" onClick={this.handleGoHome} className="btn-secondary flex-1 sm:flex-initial">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">home</span>
              <span>Dashboard</span>
            </button>
            <button type="button" onClick={this.handleReload} className={`${isPage ? "btn-secondary" : "btn-primary"} flex-1 sm:flex-initial`}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">restart_alt</span>
              <span>Reload App</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
