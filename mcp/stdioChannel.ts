/**
 * **The stdio channel, made unable to kill the server.**
 *
 * A client that gives up on a long render can close its side of the pipe while the render is still running. The
 * render then finishes, this server writes the reply, and the write fails with `EPIPE` — and because a Node
 * stream with no `error` listener turns that into an uncaught exception, the whole server dies with
 * `Error: write EPIPE at afterWriteDispatched (node:internal/stream_base_commons:159:15)`, thrown from
 * `StdioServerTransport.send`. Measured three times by the owner: "long renders always crash", and the file the
 * render did produce is lost to the caller with no sentence saying so.
 *
 * Two things are wrong with that and they are separable:
 *
 *   · the process must not die because a client went away — `ProtocolChannel` is the protocol's own writer, it
 *     installs the missing `error` listener, and it reports every reply it could not deliver instead of throwing;
 *   · the fact must not be swallowed — each undelivered frame is named on stderr, and a reply carrying a `path`
 *     (every render) names the file that *was* written, so a person can still pick the render up.
 *
 * **This is the one place all protocol writes go through**, which is why the progress notifications are covered
 * too: `notifications/progress` is sent by the SDK through the same `send()`, so a client that closed the pipe
 * mid-render cannot crash the server with a heartbeat either. The diagnostic channel (`process.stderr`) is guarded
 * the same way but can only swallow, because a broken stderr is by definition nowhere to complain.
 */
import { Writable } from "node:stream";

/** What a frame is, in the words a person reading a log needs: which request, and which file if it carries one. */
export function describeProtocolFrame(chunk: string | Uint8Array): string {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  try {
    const frame = JSON.parse(text) as {
      id?: unknown;
      method?: unknown;
      result?: { path?: unknown; content?: Array<{ text?: unknown }> };
    };
    if (typeof frame.method === "string") return `the notification "${frame.method}"`;
    const path = framePath(frame.result);
    return `the reply to request ${String(frame.id ?? "?")}${path ? ` (its file is at ${path})` : ""}`;
  } catch {
    return "a protocol frame";
  }
}

/**
 * The file a reply produced, wherever this server actually puts it.
 *
 * A tool result is `{ content: [{ type: "text", text: "<the JSON>" }] }` — the path is inside that text block, not
 * a field beside it — which is exactly why the first version of this named no file at all. Both shapes are read
 * because both are honest: a transport-level message carries the field, a tool result carries the string.
 */
function framePath(result: { path?: unknown; content?: Array<{ text?: unknown }> } | undefined): string | null {
  if (typeof result?.path === "string") return result.path;
  const inner = result?.content?.[0]?.text;
  if (typeof inner !== "string") return null;
  try {
    const parsed = JSON.parse(inner) as { path?: unknown };
    return typeof parsed?.path === "string" ? parsed.path : null;
  } catch {
    return null;
  }
}

/**
 * The protocol's writer: it never rejects, never throws, and never lets a broken pipe reach the event loop
 * unhandled.
 *
 * It extends `Writable` because that is what `StdioServerTransport` takes, and because the transport's `send()`
 * resolves on `true` or waits for `'drain'` — the pending write count of a `Writable` whose `_write` completes
 * immediately stays at zero, so a send resolves at once and a broken pipe cannot leave a request hanging.
 */
export class ProtocolChannel extends Writable {
  /** The first failure seen, so later reports can say the same thing without re-deriving it. */
  private broken: string | null = null;

  constructor(
    private readonly sink: Writable,
    private readonly record: (fact: string) => void
  ) {
    super();
    /**
     * **The listener that stops the crash.** Node emits `error` on the stream after a failed write, and a stream
     * with no `error` listener throws it (uncaught, fatal). Installing one turns "the client is gone" into a
     * recorded fact; the write callback below is what names the individual frame.
     */
    sink.on("error", (error: NodeJS.ErrnoException) => this.noteBroken(error, true));
    // A channel error of our own is a fact too — recorded, never unhandled.
    this.on("error", (error: Error) => this.record(`the protocol channel failed (${error.message})`));
  }

  /** The code a caller reads: `EPIPE`, `ERR_STREAM_DESTROYED`, … */
  private static codeOf(error: unknown): string {
    const candidate = error as NodeJS.ErrnoException | undefined;
    return candidate?.code ?? (error instanceof Error ? error.message : String(error));
  }

  private noteBroken(error: unknown, announce: boolean): string {
    const code = ProtocolChannel.codeOf(error);
    if (!this.broken) {
      this.broken = code;
      if (announce) {
        this.record(
          `the client closed its side of the stdio pipe (${code}); the server stays alive so it can finish the work it ` +
            `started, but no reply can be delivered on this pipe — replies that cannot be delivered are named below`
        );
      }
    }
    return this.broken;
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const frame = describeProtocolFrame(chunk);
    if (this.broken) {
      this.record(`${frame} was not delivered: the client disconnected (${this.broken})`);
      callback();
      return;
    }
    try {
      this.sink.write(chunk, (error?: Error | null) => {
        if (!error) return;
        const code = this.noteBroken(error, true);
        this.record(`${frame} was not delivered: the client disconnected (${code})`);
      });
      // Never report the failure to the transport: the reply is the transport's business, the pipe is ours.
      callback();
    } catch (error) {
      const code = this.noteBroken(error, true);
      this.record(`${frame} was not delivered: the client disconnected (${code})`);
      callback();
    }
  }
}

/**
 * **A diagnostic channel that cannot crash the process either.**
 *
 * `console.error` is how this server says everything it has to say, including the shutdown reason and the
 * undelivered-reply facts above. If the client's stderr reader is gone, that write fails the same way — and there
 * is nowhere left to report it, so this guard can only swallow. Swallowing is the correct destination for a
 * diagnostic about the diagnostic channel; crashing is not.
 */
export function guardDiagnosticWrites(sink: Writable = process.stderr): void {
  sink.on("error", () => {
    /* nothing to write to, and nothing to write on */
  });
}

/** Where an undelivered-reply fact is recorded. Plain stderr, and never through the channel being reported on. */
function recordOnStderr(fact: string): void {
  try {
    process.stderr.write(`groove-lab MCP: ${fact}\n`);
  } catch {
    /* the diagnostic channel is gone too */
  }
}

/**
 * Install the guards and return the stream the transport must write to.
 *
 * Called from `main()` rather than at module scope for the reason `installRendererLifecycle` is: `createServer` is
 * imported by tests, and a module-scope listener on a test process's own stdout would outlive the test.
 */
export function installStdioGuards(sink: Writable = process.stdout): ProtocolChannel {
  guardDiagnosticWrites();
  return new ProtocolChannel(sink, recordOnStderr);
}
