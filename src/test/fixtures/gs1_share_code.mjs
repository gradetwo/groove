/**
 * A real GS-1 share code, produced by the **synth project's own encoder** — not by hand.
 *
 *   cd /home/crow/music/synth
 *   node -e "import('./mcp/lib/data.mjs').then(async ({loadData}) => {
 *     const d = await loadData();
 *     const { presetShareCode } = await import('./mcp/lib/patch.mjs');
 *     console.log(presetShareCode(d, 'acid').code);
 *   })"
 *
 * It is the exact string `gs1.patch.get` hands a caller for the `acid` factory preset, so a fixture
 * built here cannot pass while the tool that produces the real thing would fail. Both the criteria
 * test (`src/test/gs1ParamWrites.test.ts`) and the MCP gate (`scripts/check_mcp.mjs`) read it from
 * this one place.
 */
export const ACID_SHARE_CODE =
  "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsLTEyLDcsMC44LDAuNSwwLDMsLTEyLC02LDAuMiwwLjUsMCw4MDAsMC44NSwwLjU1LDAuNzUsMCwwLjAwMiwwLjE0LDAuMiwwLjEyLDAsMCw0LjYsMC4zMiwwLDAsMCwwLjQ1LDAuMSwwLDIsMC4zNSwwLjIyLDAsMTIwLDIsMCwwLDAsMCwwLDAuNSwwLjYsMC40LDAsMC4zLDAuNSwwLjQsMCwwLjQsMC42LDAuNSwwLDAuNCwwLjYsMC4wMSwwLjMsMC41LDAuMywwLDEsMC41LDAuMywwLDAuMzUsMC44LDAuMDEyLDEsMC4zNSwxLDAuMzUsMCwwLDAsMCwyLjgxLDAsMC4zNSwwLDEsMiwzLDQsNSw2LDAsMCwwLDAsMCwwLDAsMSw2MCwwLDAsMSwwLDEsMiwzLDQsNSw2LDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwwLDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwxLDAsMCwwLDAsMC40LDAsMC40LDAsMCwwLDAsOTAwMCwwLjI1LDAuMTUsMC41LDAsOCw0LDAuNSwxLDAsMCwyMDAsMCwxMDAwLDAuOSwwLDQwMDAsMSwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDEsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwXSwiciI6W1swLDAsMC44LDFdLFsyLDAsMC41NSwxXSxbMCwxLDAuMTgsMF0sWzMsMCwwLjQsMF1dfQ";
