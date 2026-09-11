import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
}

export interface SelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  "aria-label": string;
  className?: string;
  disabled?: boolean;
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  "aria-label": ariaLabel,
  className = "",
  disabled = false,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = options[selectedIndex];

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Scroll highlighted into view
  useEffect(() => {
    if (isOpen && listboxRef.current && highlightedIndex >= 0) {
      const item = listboxRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView?.({ block: "nearest" });
    }
  }, [isOpen, highlightedIndex]);

  const selectOption = useCallback(
    (opt: SelectOption<T>) => {
      onChange(opt.value);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case "Home":
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightedIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          selectOption(options[highlightedIndex]);
        }
        break;
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 relative ${className}`} ref={containerRef}>
      {label && (
        <span className="text-xs font-mono text-text-sub font-medium truncate">
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`min-h-[44px] px-3.5 py-2 rounded bg-panel2 border border-line hover:border-accent/40 focus-visible:border-accent focus-visible:outline-none flex items-center justify-between gap-2 text-left text-sm transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <span className="truncate font-sans text-text">
          {selectedOption ? selectedOption.label : "—"}
        </span>
        <ChevronDown
          size={16}
          className={`text-text-sub transition-transform shrink-0 ${isOpen ? "rotate-180 text-accent" : ""}`}
        />
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <ul
          ref={listboxRef}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-full left-0 right-0 mt-1 z-50 max-h-60 overflow-y-auto rounded-md bg-panel border border-line shadow-2xl p-1 font-sans focus:outline-none"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;

            return (
              <li
                key={String(opt.value)}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`min-h-[40px] px-3 py-2 rounded flex items-center justify-between gap-2 cursor-pointer text-sm transition-colors ${
                  isSelected
                    ? "bg-accent/10 text-accent font-semibold"
                    : isHighlighted
                    ? "bg-panel2 text-text"
                    : "text-text-sub hover:text-text"
                }`}
              >
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-text-sub truncate">{opt.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-line text-text-sub font-mono">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check size={14} className="text-accent" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
