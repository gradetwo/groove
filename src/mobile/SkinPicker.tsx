/**
 * The skin picker (更多 → 外观).
 *
 * Four skins, and the picker is deliberately a *preview* rather than a list of names: a skin is a look,
 * and "复古漫画" means nothing until you can see its paper, ink and accent next to the others. Each
 * option paints its own three colours from the catalogue (`SKINS`), which is why those live in data
 * rather than in CSS — an inactive skin's stylesheet rules do not apply, so its colours cannot be read
 * back out of the cascade.
 *
 * It is a real radio group (`role="radiogroup"` / `role="radio"` / `aria-checked`) rather than four
 * toggle buttons: exactly one skin is active, and that is what a radio group means. The selected option
 * is marked visually *and* by `aria-checked`, so the state is not colour-only.
 *
 * Applying the skin is the hook's job (`useSkin` writes `data-skin` on `<html>`); this component never
 * touches the attribute itself.
 */
import React from "react";
import { Check } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useSkin } from "../hooks/useSkin";

export function SkinPicker() {
  const { t } = useLanguage();
  const { skin, setSkin, skins } = useSkin();

  return (
    <section className="mt-3" data-testid="mobile-skin-picker">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold" id="mobile-skin-picker-heading">
          {t("mobile_more_appearance")}
        </h2>
        <span className="m-mono text-[10px] text-[var(--m-ink-3)]">{t("mobile_more_appearance_hint")}</span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="mobile-skin-picker-heading"
        className="mt-2 grid grid-cols-2 gap-2"
        data-testid="mobile-skin-list"
      >
        {skins.map((option) => {
          const active = option.id === skin;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`mobile-skin-${option.id}`}
              onClick={() => setSkin(option.id)}
              className={`m-press relative flex min-h-[72px] w-full flex-col items-start gap-1.5 rounded-2xl border p-2.5 text-left ${
                active
                  ? "border-[var(--m-gold)] bg-[var(--m-card-2)]"
                  : "border-[var(--m-line)] bg-[var(--m-card)]"
              }`}
            >
              {/* The swatch: the skin's ground, accent and ink, in the order it uses them. */}
              <span className="flex h-5 w-full items-stretch gap-1" aria-hidden="true">
                <span className="w-1/2 rounded-[3px]" style={{ background: option.preview.ground }} />
                <span className="w-1/3 rounded-[3px]" style={{ background: option.preview.accent }} />
                <span className="flex-1 rounded-[3px]" style={{ background: option.preview.ink }} />
              </span>
              <span className="min-w-0 w-full truncate text-[12px] font-medium">{t(option.nameKey)}</span>
              <span className="line-clamp-2 w-full text-[10px] leading-tight text-[var(--m-ink-3)]">
                {t(option.blurbKey)}
              </span>
              {active && (
                <span
                  className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--m-gold)] text-[var(--m-on-gold)]"
                  aria-hidden="true"
                >
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
