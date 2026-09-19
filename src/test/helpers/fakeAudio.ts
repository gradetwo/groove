/**
 * Shared Web Audio doubles for unit tests.
 *
 * jsdom ships no AudioContext at all, which is why the audio layer historically had
 * only getter-level tests. These doubles are deliberately strict about the one rule
 * browsers enforce hard: `exponentialRampToValueAtTime` rejects a target <= 0.
 */

export class FakeAudioParam {
  value = 0;
  events: Array<{ type: string; value: number; time: number }> = [];
  exponentialTargets: number[] = [];

  setValueAtTime(value: number, time = 0) {
    this.events.push({ type: "setValueAtTime", value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time = 0) {
    if (!Number.isFinite(value)) throw new RangeError(`linearRampToValueAtTime: ${value}`);
    this.events.push({ type: "linearRampToValueAtTime", value, time });
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number, time = 0) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`exponentialRampToValueAtTime target must be > 0, got ${value}`);
    }
    this.exponentialTargets.push(value);
    this.events.push({ type: "exponentialRampToValueAtTime", value, time });
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, time = 0) {
    this.events.push({ type: "setTargetAtTime", value, time });
    this.value = value;
    return this;
  }
  setValueCurveAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
  cancelAndHoldAtTime() {
    return this;
  }
}

export class FakeNode {
  /**
   * Every real `AudioNode` carries these three, and code that re-routes a stereo branch sets them
   * (`channelCount 2 / explicit / speakers` is how a mono mix survives a splitter). Omitting them
   * made that wiring unassertable — and a test mock that cannot express the property cannot catch
   * the bug either.
   */
  channelCount = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";
  /** Nodes that were connected INTO this node — lets tests assert routing. */
  incoming: FakeNode[] = [];
  /**
   * Every edge out of this node, with the output and input indices it was made on.
   *
   * `incoming` alone cannot tell a `ChannelSplitterNode`'s two outputs apart, and "which output
   * feeds which tap" was exactly the stereo-chorus defect; the same applies to the two inputs of a
   * merger. Recording the indices makes that routing assertable instead of assumed.
   */
  outgoing: Array<{ node: FakeNode; outputIndex: number; inputIndex: number }> = [];
  /**
   * How many times `disconnect()` was called on this node.
   *
   * Tearing an edge down and rebuilding the identical one is not a no-op in a live graph: it is a
   * brief open circuit. Counting the calls is how a test tells "the routing was rebuilt" from "a
   * value was written", which is the difference between a click and no click.
   */
  disconnectCalls = 0;
  connect(destination?: unknown, outputIndex = 0, inputIndex = 0) {
    if (destination instanceof FakeNode) {
      destination.incoming.push(this);
      this.outgoing.push({ node: destination, outputIndex, inputIndex });
    }
    return destination ?? this;
  }
  disconnect() {
    this.disconnectCalls += 1;
    return this;
  }
}

export class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

export class FakePeriodicWave {
  constructor(
    public real: Float32Array,
    public imag: Float32Array
  ) {}
}

export class FakeOscillatorNode extends FakeNode {
  type = "sine";
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  started = false;
  /**
   * The periodic wave this oscillator was switched to, if any.
   *
   * Recorded rather than ignored: a preset's `harmonics` are its timbre, so a test has to be able
   * to assert that the wavetable actually reached the oscillator — an unrecorded call would let a
   * preset claim a drawbar registration while still playing a square.
   */
  periodicWave: FakePeriodicWave | null = null;
  setPeriodicWave(wave: FakePeriodicWave) {
    this.periodicWave = wave;
  }
  /** Recorded `start(when)` times, so tests can assert onset stagger (E-01). */
  startedAt: number[] = [];
  /** Recorded `stop(when)` times, so tests can assert note length (chord articulation). */
  stoppedAt: number[] = [];
  start(when = 0) {
    this.started = true;
    this.startedAt.push(when);
  }
  stop(when = 0) {
    this.stoppedAt.push(when);
  }
}

export class FakeFilterNode extends FakeNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  /**
   * Real `BiquadFilterNode` exposes `gain` (used by peaking/lowshelf/highshelf). It was
   * missing here, so any path through a peaking filter threw "cannot set properties of
   * undefined" — the 909 hi-hat's presence filter was untestable as a result.
   */
  gain = new FakeAudioParam();
}

export class FakeBufferSourceNode extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeAudioParam();
  loop = false;
  /**
   * Recorded `start(when, offset)` calls. The offset is what E-06 varies per hit so
   * repeated drum hits are not bit-identical, so tests need to see it.
   */
  started: Array<{ when: number; offset: number }> = [];
  start(when = 0, offset = 0) {
    this.started.push({ when, offset });
  }
  stop() {}
}

export class FakeStereoPannerNode extends FakeNode {
  pan = new FakeAudioParam();
}

export class FakeWaveShaperNode extends FakeNode {
  curve: unknown = null;
  oversample = "none";
}

export class FakePannerNode extends FakeNode {
  panningModel: PanningModelType = "equalpower";
  distanceModel: DistanceModelType = "inverse";
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  coneOuterGain = 0;
  positionX = new FakeAudioParam();
  positionY = new FakeAudioParam();
  positionZ = new FakeAudioParam();
  orientationX = new FakeAudioParam();
  orientationY = new FakeAudioParam();
  orientationZ = new FakeAudioParam();
  /** Legacy API recorded so tests can assert positions on either path. */
  legacyPosition: { x: number; y: number; z: number } | null = null;
  setPosition(x: number, y: number, z: number) {
    this.legacyPosition = { x, y, z };
  }
}

export class FakeConvolverNode extends FakeNode {
  buffer: unknown = null;
}

export class FakeDelayNode extends FakeNode {
  delayTime = new FakeAudioParam();
  /** `createDelay(maxDelayTime)`; recorded so tests can assert the bound. */
  maxDelayTime = 1;
}

export class FakeCompressorNode extends FakeNode {
  threshold = new FakeAudioParam();
  knee = new FakeAudioParam();
  ratio = new FakeAudioParam();
  attack = new FakeAudioParam();
  release = new FakeAudioParam();
  reduction = 0;
}

export class FakeChannelSplitterNode extends FakeNode {
  constructor(public numberOfOutputs = 2) {
    super();
  }
}

export class FakeChannelMergerNode extends FakeNode {
  constructor(public numberOfInputs = 2) {
    super();
  }
}

export class FakeAnalyserNode extends FakeNode {
  fftSize = 2048;
  frequencyBinCount = 1024;
  getByteFrequencyData() {}
  getByteTimeDomainData() {}
  getFloatFrequencyData() {}
}

export class FakeAudioBuffer {
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number
  ) {}
  private channels = new Map<number, Float32Array>();
  /**
   * Real `AudioBuffer` has `duration`, and code that reports it to the user (`ExportedWav`) or
   * measures a render needs it. Without this, a fake-rendered export reported `durationSec:
   * undefined` — a hole in the double rather than a bug in the caller, but it made the caller's
   * contract untestable.
   */
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    if (!this.channels.has(channel)) this.channels.set(channel, new Float32Array(this.length));
    return this.channels.get(channel)!;
  }
}

/** Base graph API shared by the realtime and offline doubles. */
export class FakeAudioGraph {
  destination = new FakeNode();
  createdGains: FakeGainNode[] = [];
  createdOscillators: FakeOscillatorNode[] = [];
  createdFilters: FakeFilterNode[] = [];
  createdPanners: FakeStereoPannerNode[] = [];
  createdSpatialPanners: FakePannerNode[] = [];
  createdBufferSources: FakeBufferSourceNode[] = [];
  createdChannelSplitters: FakeChannelSplitterNode[] = [];
  createdChannelMergers: FakeChannelMergerNode[] = [];

  createGain() {
    const node = new FakeGainNode();
    this.createdGains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeOscillatorNode();
    this.createdOscillators.push(node);
    return node;
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    return new FakePeriodicWave(real, imag);
  }
  createBiquadFilter() {
    const node = new FakeFilterNode();
    this.createdFilters.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeBufferSourceNode();
    this.createdBufferSources.push(node);
    return node;
  }
  createStereoPanner() {
    const node = new FakeStereoPannerNode();
    this.createdPanners.push(node);
    return node;
  }
  createPanner() {
    const node = new FakePannerNode();
    this.createdSpatialPanners.push(node);
    return node;
  }
  createWaveShaper() {
    return new FakeWaveShaperNode();
  }
  createConvolver() {
    return new FakeConvolverNode();
  }
  /** Recorded so tests can read back the scheduled delay time (see DelayBus/N-14). */
  createdDelays: FakeDelayNode[] = [];
  createDelay(maxDelayTime = 1) {
    const node = new FakeDelayNode();
    node.maxDelayTime = maxDelayTime;
    this.createdDelays.push(node);
    return node;
  }
  createDynamicsCompressor() {
    return new FakeCompressorNode();
  }
  createAnalyser() {
    return new FakeAnalyserNode();
  }
  createChannelSplitter(numberOfOutputs = 2) {
    const node = new FakeChannelSplitterNode(numberOfOutputs);
    this.createdChannelSplitters.push(node);
    return node;
  }
  createChannelMerger(numberOfInputs = 2) {
    const node = new FakeChannelMergerNode(numberOfInputs);
    this.createdChannelMergers.push(node);
    return node;
  }
  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }
}

/** Stand-in used by tests that call the realtime engine's construction path. */
export class FakeAudioContext extends FakeAudioGraph {
  currentTime = 0;
  sampleRate = 44100;
  state: AudioContextState = "running";
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

/** Stand-in for OfflineAudioContext used by the WAV renderer. */
export class FakeOfflineAudioContext extends FakeAudioGraph {
  currentTime = 0;
  state: AudioContextState = "suspended";
  /**
   * Minimal `AudioWorklet` surface.
   *
   * The offline renderer only reaches for GS-1 when the context can load a worklet module, so a
   * fake without this makes any GS-1 exporter test vacuous: the code path under test would skip
   * itself and the assertions would pass on an empty graph.
   */
  audioWorklet = { addModule: async (_url: string) => undefined };
  /** Most recently constructed instance — lets tests inspect the graph after a render. */
  static lastInstance: FakeOfflineAudioContext | null = null;

  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number
  ) {
    super();
    FakeOfflineAudioContext.lastInstance = this;
  }

  startRendering() {
    return Promise.resolve(new FakeAudioBuffer(this.numberOfChannels, this.length, this.sampleRate));
  }
}

/**
 * Installs the fake realtime AudioContext on `window`/`globalThis` so the realtime
 * engine's `initAudioContext()` succeeds inside jsdom. Returns a restore function.
 */
export function installFakeAudioContext(): () => void {
  const g = globalThis as any;
  const originalGlobal = g.AudioContext;
  const originalWindow = g.window?.AudioContext;
  const originalWebkit = g.window?.webkitAudioContext;

  g.AudioContext = FakeAudioContext;
  if (g.window) {
    g.window.AudioContext = FakeAudioContext;
    g.window.webkitAudioContext = FakeAudioContext;
  }

  return () => {
    g.AudioContext = originalGlobal;
    if (g.window) {
      g.window.AudioContext = originalWindow;
      g.window.webkitAudioContext = originalWebkit;
    }
  };
}

/** Installs a fake OfflineAudioContext on globalThis and returns a restore function. */
export function installFakeOfflineAudioContext(): () => void {
  const originalWindow = (globalThis as any).window?.OfflineAudioContext;
  const originalGlobal = (globalThis as any).OfflineAudioContext;
  (globalThis as any).OfflineAudioContext = FakeOfflineAudioContext;
  if ((globalThis as any).window) {
    (globalThis as any).window.OfflineAudioContext = FakeOfflineAudioContext;
  }
  return () => {
    (globalThis as any).OfflineAudioContext = originalGlobal;
    if ((globalThis as any).window) {
      (globalThis as any).window.OfflineAudioContext = originalWindow;
    }
  };
}
