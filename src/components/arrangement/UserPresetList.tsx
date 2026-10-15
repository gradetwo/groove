import React, { useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { UserPreset } from "../../data/userPresets";

/**
 * ⭐ **The project's own saved synth patches, listed where the sounds they were made from are chosen.**
 *
 * Until this existed, a person could shape a sound in this app and lose it: the synth's factory presets applied, the
 * parameters were writable, and nothing kept the result. The MCP tools could already save and list them, so an agent had a
 * capability no person did — and the `webEntryReachability` ledger recorded exactly that as an unreachable operation.
 *
 * ⚠️ **It sits beside the preset chooser on purpose.** Saving a lane's sound is only meaningful next to picking one, and a
 * separate "presets" screen would have made "save what I just chose" a journey. The list is deliberately plain: a name, the
 * category, the two actions that change it, and one that takes it out of the project as a share code.
 */
export interface UserPresetListProps {
  presets: readonly UserPreset[];
  /** The label of the preset that would be replaced, or `""` when nothing of the project's is chosen. */
  selectedId: string;
  /** Save the lane's current sound under `name`. */
  onSave: (name: string) => void;
  /** Put one preset's sound back on the lane. */
  onApply: (preset: UserPreset) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Hand the preset's share code back to the caller, which decides how to offer it for copying. */
  onExport: (preset: UserPreset) => void;
  /** The lane a save would copy, so the button can say what it is about to capture. */
  trackName: string;
  /** The code the lane carries now, or `undefined` — what "save" would store. */
  currentCode: string | undefined;
  idPrefix?: string;
}

export const UserPresetList: React.FC<UserPresetListProps> = ({
  presets,
  selectedId,
  onSave,
  onApply,
  onRename,
  onDelete,
  onExport,
  trackName,
  currentCode,
  idPrefix = "user-presets",
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | undefined>(undefined);
  const [renameDraft, setRenameDraft] = useState("");

  /**
   * ⭐ **Saving a lane with no code of its own is still worth allowing**: the preset then stores an empty base and the
   * lane's overrides, which is a real sound. Only a blank *name* is refused, because the name is how it is found again.
   */
  const canSave = name.trim() !== "";

  return (
    <div className="flex flex-col gap-2" data-testid={idPrefix}>
      <label
        htmlFor={`${idPrefix}-name`}
        className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-text-sub"
      >
        {t("user_preset_label")}
      </label>

      <div className="flex gap-1">
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("user_preset_name_placeholder")}
          data-testid={`${idPrefix}-name`}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-[11px] text-text outline-none focus-visible:border-accent/60"
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            onSave(name.trim());
            setName("");
          }}
          data-testid={`${idPrefix}-save`}
          title={`${trackName}: ${currentCode === undefined ? t("user_preset_no_code") : t("user_preset_has_code")}`}
          className="shrink-0 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-[10px] font-semibold text-text disabled:opacity-40 enabled:hover:border-accent/60 enabled:hover:text-accent"
        >
          {t("user_preset_save")}
        </button>
      </div>

      {presets.length === 0 ? (
        <p className="text-[10px] text-text-dim" data-testid={`${idPrefix}-empty`}>
          {t("user_preset_empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid={`${idPrefix}-list`}>
          {presets.map((preset) => (
            <li
              key={preset.id}
              data-testid={`${idPrefix}-item-${preset.id}`}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                preset.id === selectedId ? "border-accent/60 bg-accent/10" : "border-line bg-panel2"
              }`}
            >
              {renamingId === preset.id ? (
                <>
                  <input
                    type="text"
                    value={renameDraft}
                    autoFocus
                    aria-label={t("user_preset_rename")}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    data-testid={`${idPrefix}-rename-input-${preset.id}`}
                    className="min-w-0 flex-1 rounded border border-line bg-transparent px-1 py-0.5 text-[11px] text-text outline-none"
                  />
                  <button
                    type="button"
                    data-testid={`${idPrefix}-rename-confirm-${preset.id}`}
                    onClick={() => {
                      if (renameDraft.trim() !== "") onRename(preset.id, renameDraft.trim());
                      setRenamingId(undefined);
                    }}
                    className="shrink-0 rounded px-1 text-[10px] text-accent hover:underline"
                  >
                    {t("user_preset_confirm")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onApply(preset)}
                    data-testid={`${idPrefix}-apply-${preset.id}`}
                    title={t("user_preset_apply")}
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-text hover:text-accent"
                  >
                    {preset.name}
                    <span className="ml-1 text-[9px] text-text-dim">{preset.cat}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(preset.id);
                      setRenameDraft(preset.name);
                    }}
                    data-testid={`${idPrefix}-rename-${preset.id}`}
                    title={t("user_preset_rename")}
                    className="shrink-0 rounded px-1 text-[10px] text-text-dim hover:text-text"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => onExport(preset)}
                    data-testid={`${idPrefix}-export-${preset.id}`}
                    title={t("user_preset_export")}
                    className="shrink-0 rounded px-1 text-[10px] text-text-dim hover:text-text"
                  >
                    ⤴
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(preset.id)}
                    data-testid={`${idPrefix}-delete-${preset.id}`}
                    title={t("user_preset_delete")}
                    className="shrink-0 rounded px-1 text-[10px] text-text-dim hover:text-red-400"
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
