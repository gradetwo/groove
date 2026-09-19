/**
 * Writing an FX value must not rebuild the FX graph.
 *
 * `EffectsRack.setFilter()` called `updateFilterRouting()` unconditionally, and that method tears
 * both edges down (`inputNode.disconnect()`, `filterNode.disconnect()`) before reconnecting them —
 * a brief open circuit in the master path, i.e. a click. `applyGenreFxToGraph()` calls `setFilter`
 * on **every pattern set and every BPM change**, so with the filter engaged, dragging the tempo
 * slider clicked the master filter once per input event.
 *
 * The routing depends on `filterEnabled` alone, exactly like the per-track insert chain, which
 * already guards its re-route with a `routingSignature`. These tests use `disconnectCalls` on the
 * fake nodes: tearing down an identical edge and rebuilding it is not a no-op in a live graph, and
 * that is the difference between a click and no click.
 */
import { describe, it, expect } from "vitest";
import { EffectsRack } from "../audio/EffectsRack";
import { applyGenreFxToGraph, resolveGenreFx } from "../data/genreFx";
import { buildMasterGraph } from "../audio/masterGraph";
import { FakeAudioContext, FakeFilterNode, FakeNode } from "./helpers/fakeAudio";

interface RackInternals {
  inputNode: FakeNode;
  filterNode: FakeFilterNode;
  shaperNode: FakeNode;
}

function makeRack(): { ctx: FakeAudioContext; rack: EffectsRack; inner: RackInternals } {
  const ctx = new FakeAudioContext();
  const rack = new EffectsRack(ctx as unknown as BaseAudioContext);
  return { ctx, rack, inner: rack as unknown as RackInternals };
}

describe("FX rack · a value write does not rewire the graph", () => {
  it("keeps the filter edges when only cutoff and Q change", () => {
    const { rack, inner } = makeRack();
    rack.setFilter(true, 8000, 1);

    const inputDisconnects = inner.inputNode.disconnectCalls;
    const filterDisconnects = inner.filterNode.disconnectCalls;

    // Dragging the cutoff: many writes, one unchanged topology.
    for (const hz of [6000, 4000, 2500, 1200, 700]) rack.setFilter(true, hz, 0.9);

    expect(inner.inputNode.disconnectCalls).toBe(inputDisconnects);
    expect(inner.filterNode.disconnectCalls).toBe(filterDisconnects);
    // The values really were written — this is not "nothing happened".
    expect(inner.filterNode.frequency.value).toBe(700);
    expect(inner.filterNode.Q.value).toBe(0.9);
    rack.destroy();
  });

  it("still re-routes when the filter is switched in and out", () => {
    const { rack, inner } = makeRack();
    rack.setFilter(false, 8000, 1);
    const afterDisable = inner.inputNode.disconnectCalls;
    expect(inner.inputNode.outgoing.at(-1)?.node).toBe(inner.shaperNode);

    rack.setFilter(true, 8000, 1);
    expect(inner.inputNode.disconnectCalls).toBeGreaterThan(afterDisable);
    // …and the live path is the enabled one: input -> filter (the filter feeds the shaper).
    expect(inner.inputNode.outgoing.at(-1)?.node).toBe(inner.filterNode);
    expect(inner.filterNode.outgoing.at(-1)?.node).toBe(inner.shaperNode);

    rack.setFilter(false, 8000, 1);
    expect(inner.inputNode.outgoing.at(-1)?.node).toBe(inner.shaperNode);
    rack.destroy();
  });

  it("leaves an engaged filter alone when the genre FX is re-applied at a new tempo", () => {
    // The user-visible path: the filter comes from the genre profile, and the profile is re-applied
    // on every BPM change — so this is the tempo slider, not a hypothetical caller.
    const ctx = new FakeAudioContext();
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, { analysers: false });
    const fx = resolveGenreFx("chicago-house");
    expect(fx, "no FX profile resolved for chicago-house").toBeTruthy();
    applyGenreFxToGraph(graph, fx!, 120);

    const inner = graph.fxRack as unknown as RackInternals;
    const inputDisconnects = inner.inputNode.disconnectCalls;

    for (const bpm of [121, 124, 128, 132, 140]) applyGenreFxToGraph(graph, fx!, bpm);

    expect(inner.inputNode.disconnectCalls).toBe(inputDisconnects);
    graph.fxRack.destroy();
  });
});
