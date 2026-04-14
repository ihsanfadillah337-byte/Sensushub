import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 m-8 border-2 border-red-500 rounded bg-red-50 text-red-900 overflow-auto max-h-screen">
          <h2 className="text-xl font-bold mb-4">Aplikasi Crash Mendadak!</h2>
          <p className="mb-2">Tolong SS tangkapan layar ini dan kirim ke AI:</p>
          <pre className="text-xs bg-red-900/10 p-4 rounded whitespace-pre-wrap font-mono">
            <strong>Error:</strong> {this.state.error?.toString()}
          </pre>
          <pre className="text-[10px] bg-red-900/10 mt-2 p-4 rounded whitespace-pre-wrap font-mono">
            <strong>Component StackTrace:</strong>
            {this.state.errorInfo?.componentStack}
          </pre>
          <button 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => window.location.reload()}
          >
            Muat Ulang Halaman
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
