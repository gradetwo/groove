import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
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
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught an unhandled exception]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-6 bg-[#0a0b0d]">
          <div className="max-w-md w-full rounded-2xl bg-[#121317] border border-rose-500/30 p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h2 className="text-lg font-bold text-[#e9e7e0] mb-2 font-mono">
              {this.props.fallbackTitle || "组件运行异常 / Component Error"}
            </h2>

            <p className="text-xs text-[#8b8f99] mb-4 leading-relaxed">
              {this.state.error?.message || "发生未知错误，请重试或刷新页面。"}
            </p>

            {import.meta.env.DEV && this.state.errorInfo && (
              <pre className="w-full max-h-36 overflow-auto text-[10px] text-left font-mono bg-[#090a0d] p-3 rounded-lg border border-[#23262d] text-rose-300 mb-4 select-text">
                {this.state.error?.stack}
              </pre>
            )}

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold bg-[#f5b73d] hover:bg-[#ffc24b] text-zinc-950 transition-colors shadow-lg shadow-[#f5b73d]/10"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重试 / Retry</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-medium bg-[#1a1c22] hover:bg-[#252834] text-[#e9e7e0] border border-[#2d3139] transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                <span>刷新 / Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
