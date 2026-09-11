import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  description,
  onRetry,
  retryLabel = "重试 / Retry",
  className = "",
}) => {
  return (
    <div
      role="alert"
      className={`p-6 rounded-lg bg-panel border border-red-500/30 flex flex-col items-center justify-center text-center max-w-md mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3 text-red-400">
        <AlertTriangle size={24} />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-text-sub max-w-sm mb-4 leading-relaxed font-sans">
          {description}
        </p>
      )}
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw size={14} />}
          className="mt-1"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
};
