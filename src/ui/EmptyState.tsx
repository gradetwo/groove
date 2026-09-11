import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className = "",
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#181a22] border border-line flex items-center justify-center text-text-sub mb-3.5 shadow-md">
          {icon}
        </div>
      )}
      <h4 className="font-['Space_Grotesk'] text-sm sm:text-base font-bold text-text mb-1">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-text-sub leading-relaxed mb-4">
          {description}
        </p>
      )}
      {action ? (
        <div className="mt-1">{action}</div>
      ) : actionLabel && onAction ? (
        <div className="mt-1">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
