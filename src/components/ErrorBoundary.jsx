import React from 'react';
import { Button } from './Button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-6 text-center space-y-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 m-4">
          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center font-bold text-xl">
            !
          </div>
          <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-100">
            Something went wrong loading this section
          </h3>
          <p className="text-xs text-slate-500 max-w-md">
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
