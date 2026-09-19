import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: React.ReactNode;
  /** Label for the confirming action. Callers pass an already-localized string. */
  confirmLabel?: string;
  /** Label for the cancel action. Callers pass an already-localized string. */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** "danger" tints the confirm action red for destructive operations. */
  tone?: "default" | "danger";
}

/**
 * Small confirmation dialog built on the shared `Modal` primitive.
 *
 * Replaces `window.confirm` so destructive actions are rendered in-app, remain
 * keyboard/ARIA accessible, and can be localized by the caller.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  tone = "default",
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      showCloseButton={false}
    >
      <div className="px-5 sm:px-6 py-5 space-y-5">
        {description && (
          <p className="text-sm text-text-sub leading-relaxed">{description}</p>
        )}
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
