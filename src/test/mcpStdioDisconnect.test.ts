/**
 * **A client that closes its side of the pipe must not be able to kill the server.**
 *
 * Measured, three times, by the owner's creation test: a long `render_song` outlives the *client's* timeout, the
 * client closes the pipe, the render finishes, and the reply write blows the server up with
 * `Error: write EPIPE at afterWriteDispatched (node:internal/stream_base_commons:159:15)` — thrown out of
 * `StdioServerTransport.send`. The render then exists on disk and nobody has been told, because the process that
 * would have said so is gone.
 *
 * The criterion here is the half that can be held without a spawn: a writer over a sink that fails exactly the way
 * a closed pipe fails must (a) not throw and not emit an unhandled `error`, (b) keep the transport's `send()`
 * resolving rather than waiting for a `'drain'` that a dead pipe never sends, and (c) **name what was not
 * delivered**, including the render's file. The end-to-end half — the real bundle, a real disconnect, the process
 * still serving the next request — is the repro recorded in the report.
 */
import { describe, expect, it } from "vitest";
import { Readable, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProtocolChannel, describeProtocolFrame, guardDiagnosticWrites } from "../../mcp/stdioChannel";

/** A sink that fails the way a pipe whose reader has gone fails: the write callback gets EPIPE. */
class ClosedPipe extends Writable {
  readonly written: Buffer[] = [];
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.written.push(Buffer.from(chunk));
    const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    // Node's measured order: the write callback first, then the stream's own `error` event.
    callback(error);
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("the protocol channel", () => {
  it("does not throw on a closed pipe, and names the reply the client never got", async () => {
    const facts: string[] = [];
    const sink = new ClosedPipe();
    const channel = new ProtocolChannel(sink, (fact) => facts.push(fact));
    const frame = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      // ⭐ The wire shape a `render_song` reply really has: the render's JSON is a string inside a text block.
      result: { content: [{ type: "text", text: JSON.stringify({ path: "/tmp/groove-lab/chicago-house_master_72bpm.wav", bytes: 1018110 }) }] },
    });

    expect(() => channel.write(frame)).not.toThrow();
    await tick();
    await tick();

    const log = facts.join("\n");
    // ⭐ The file that *was* written is named, which is what turns "the reply vanished" into something a person can act on.
    expect(log).toContain("request 2");
    expect(log).toContain("/tmp/groove-lab/chicago-house_master_72bpm.wav");
    expect(log).toContain("not delivered");
    expect(log).toContain("disconnected");
  });

  it("installs the `error` listener whose absence is the crash", () => {
    // An unhandled `error` on a stream is an uncaught exception; this listener is the whole difference.
    const sink = new ClosedPipe();
    new ProtocolChannel(sink, () => {});
    expect(sink.listenerCount("error")).toBeGreaterThan(0);
  });

  it("keeps the transport's send() resolving, rather than waiting for a drain a dead pipe never sends", async () => {
    const facts: string[] = [];
    const transport = new StdioServerTransport(
      new Readable({ read() {} }),
      new ProtocolChannel(new ClosedPipe(), (fact) => facts.push(fact))
    );
    await expect(
      transport.send({ jsonrpc: "2.0", id: 9, result: { path: "/tmp/groove-lab/song.wav" } } as never)
    ).resolves.toBeUndefined();
    // The send resolves first; the undelivered fact arrives with the write's own callback.
    await tick();
    await tick();
    expect(facts.join("\n")).toContain("request 9");
  });

  it("keeps naming later replies instead of dying on the first failure", async () => {
    // The process is alive and still working; every further reply is a fact, not a throw.
    const facts: string[] = [];
    const channel = new ProtocolChannel(new ClosedPipe(), (fact) => facts.push(fact));
    channel.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
    await tick();
    await tick();
    facts.length = 0;
    expect(() => channel.write(JSON.stringify({ jsonrpc: "2.0", id: 3, result: { path: "/tmp/groove-lab/second.wav" } }))).not.toThrow();
    await tick();
    expect(facts.join("\n")).toContain("request 3");
    expect(facts.join("\n")).toContain("/tmp/groove-lab/second.wav");
  });

  it("guards the diagnostic channel too, because the shutdown reason is written there", () => {
    const stderr = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    guardDiagnosticWrites(stderr);
    expect(stderr.listenerCount("error")).toBeGreaterThan(0);
    expect(() => stderr.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }))).not.toThrow();
  });
});

describe("naming an undelivered frame", () => {
  it("names the request for a reply, and the method for a notification", () => {
    expect(describeProtocolFrame(JSON.stringify({ jsonrpc: "2.0", id: 12, result: {} }))).toBe("the reply to request 12");
    expect(describeProtocolFrame(JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} }))).toBe(
      'the notification "notifications/progress"'
    );
  });

  it("carries the render's file when the reply has one, and says nothing it cannot know", () => {
    // The real tool-result shape: the JSON (and the path in it) lives inside the text block.
    const toolResult = JSON.stringify({ jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: JSON.stringify({ path: "/tmp/a.wav" }) }] } });
    expect(describeProtocolFrame(toolResult)).toContain("/tmp/a.wav");
    // And a transport-level message with the field beside it is read too.
    expect(describeProtocolFrame(JSON.stringify({ jsonrpc: "2.0", id: 4, result: { path: "/tmp/b.wav" } }))).toContain("/tmp/b.wav");
    expect(describeProtocolFrame("not json at all")).toBe("a protocol frame");
  });
});
