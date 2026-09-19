import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, Compass, Home, Copy, Check } from "lucide-react";
import { reportException, createDiagnosticReport, APP_VERSION } from "../utils/telemetry";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
  onNavigateHome?: () => void;
  homeLabel?: string;
  onNavigateAlternative?: () => void;
  alternativeLabel?: string;
  customFallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isCopied?: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isCopied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught unhandled exception]:", error, errorInfo);
    reportException(error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleNavigateHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onNavigateHome) {
      this.props.onNavigateHome();
    }
  };

  private handleNavigateAlternative = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onNavigateAlternative) {
      this.props.onNavigateAlternative();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.customFallback && this.state.error) {
        return this.props.customFallback(this.state.error, this.handleReset);
      }

      return (
        <div className="min-h-[440px] w-full flex items-center justify-center p-6 bg-bg">
          <div className="max-w-md w-full rounded-2xl bg-panel border border-rose-500/30 p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shrink-0 shadow-lg shadow-rose-500/10">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h2 className="text-base sm:text-lg font-bold text-text mb-2 font-mono tracking-tight">
              {this.props.fallbackTitle || "模块运行异常 / Component Error"}
            </h2>

            <p className="text-xs text-text-sub mb-3 leading-relaxed">
              {this.props.fallbackDescription ||
                this.state.error?.message ||
                "模块遇到意外异常，您可以尝试重试或切换至其他视图。"}
            </p>

            {this.state.error?.message && this.props.fallbackDescription && (
              <div className="w-full text-left font-mono text-[11px] text-rose-300/80 bg-rose-950/20 border border-rose-900/30 rounded-lg p-2.5 mb-4 select-text truncate">
                {this.state.error.message}
              </div>
            )}

            {import.meta.env.DEV && this.state.errorInfo && (
              <pre className="w-full max-h-32 overflow-auto text-[10px] text-left font-mono bg-[#090a0d] p-2.5 rounded-lg border border-line text-rose-400 mb-4 select-text">
                {this.state.error?.stack}
              </pre>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2.5 w-full pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-bold bg-accent hover:bg-[#ffc24b] text-zinc-950 transition-colors shadow-lg shadow-[#f5b73d]/10 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">重试 / Retry</span>
              </button>

              {this.props.onNavigateAlternative && (
                <button
                  type="button"
                  onClick={this.handleNavigateAlternative}
                  className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-medium bg-[#1e222b] hover:bg-[#282d39] text-text border border-[#323846] transition-colors whitespace-nowrap"
                >
                  <Compass className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                  <span className="truncate">{this.props.alternativeLabel || "切换视图"}</span>
                </button>
              )}

              {this.props.onNavigateHome ? (
                <button
                  type="button"
                  onClick={this.handleNavigateHome}
                  className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-medium bg-[#1a1c22] hover:bg-[#252834] text-text border border-[#2d3139] transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0 text-text-sub" />
                  <span className="truncate">{this.props.homeLabel || "返回工作台"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-medium bg-[#1a1c22] hover:bg-[#252834] text-text border border-[#2d3139] transition-colors whitespace-nowrap"
                >
                  <Home className="w-3.5 h-3.5 shrink-0 text-text-sub" />
                  <span className="truncate">刷新 / Reload</span>
                </button>
              )}
            </div>

            {/* Diagnostic Report Copy Button (P4-10) */}
            <div className="mt-3 pt-3 border-t border-line/40 flex items-center justify-between text-[11px] text-text-dim">
              <span>Groove Lab v{APP_VERSION}</span>
              <button
                type="button"
                onClick={() => {
                  if (this.state.error) {
                    const report = createDiagnosticReport(this.state.error, this.state.errorInfo?.componentStack);
                    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
                    this.setState({ isCopied: true });
                    setTimeout(() => this.setState({ isCopied: false }), 2000);
                  }
                }}
                className="flex items-center gap-1 text-text-sub hover:text-accent font-['JetBrains_Mono'] transition-colors"
                title="复制匿名诊断报告"
              >
                {this.state.isCopied ? (
                  <>
                    <Check className="w-3 h-3 text-[#10b981]" />
                    <span className="text-[#10b981]">已复制诊断信息</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>复制诊断报告</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

