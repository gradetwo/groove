import React from "react";
import { sectionRegions, trackRows } from "./songEdit";
import type { Song } from "../../types/song";

/**
 * The first view of the per-lane arrangement — one row per lane, one cell per section.
 *
 * It is deliberately **thin and read-only**. `songEdit` already holds the arithmetic, the keyboard model and the commands, and `trackRows` already
 * resolves each lane's clip with the flattener's own fallback; so this component renders what those return and computes nothing. That is what makes
 * it safe to add: a view cannot change the audio, and the tests that matter (the row model's) are not about React.
 *
 * What it shows for the first time: **`SongSection.slots`**. A lane that plays its own clip for a section is marked, so "this lane is different
 * here" — expressible in the model since it landed and invisible in the UI ever since — is now on screen. Dragging and editing come later; they are
 * `applyArrangementCommand`'s job, not this file's.
 */
export function TrackRows({ song }: { song: Song }): React.ReactElement {
  const rows = trackRows(song);
  const regions = sectionRegions(song);
  const cellStyle: React.CSSProperties = {
    minWidth: 64,
    padding: "4px 8px",
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    fontVariantNumeric: "tabular-nums",
  };

  if (!rows.length || !regions.length) {
    return (
      <div data-testid="track-rows" data-empty="true" style={{ opacity: 0.6, fontSize: 12 }}>
        no playable sections to lay out
      </div>
    );
  }

  return (
    <div data-testid="track-rows" style={{ display: "inline-block", fontSize: 12 }}>
      <div style={{ display: "flex" }} data-testid="track-rows-header">
        <div style={{ ...cellStyle, minWidth: 96, fontWeight: 600 }}>track</div>
        {regions.map((region) => (
          <div key={region.section.id} style={{ ...cellStyle, fontWeight: 600 }} data-testid="stage-header">
            {region.section.label ?? region.section.slot}
            <span style={{ opacity: 0.5 }}> · {region.bars}</span>
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.trackId} style={{ display: "flex" }} data-testid="track-row" data-track={row.trackId}>
          <div style={{ ...cellStyle, minWidth: 96 }}>{row.name}</div>
          {row.cells.map((cell) => (
            <div
              key={cell.sectionId}
              style={{ ...cellStyle, opacity: cell.muted ? 0.35 : 1, fontWeight: cell.override ? 600 : 400 }}
              data-testid="track-cell"
              data-slot={cell.slot}
              data-override={cell.override ? "true" : "false"}
              data-muted={cell.muted ? "true" : "false"}
            >
              {cell.slot}
              {cell.override ? <span title="this lane plays its own clip here"> *</span> : null}
              {cell.muted ? <span title="silenced for this section"> ✕</span> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
