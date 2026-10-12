/**
 * Read a WAV file into float samples — the half of the sfizz oracle that lives on this side of the boundary.
 *
 * sfizz cannot be installed on the development machine (its releases ship macOS and Windows binaries and a **source** tarball, so a Linux oracle means
 * building it in CI). What *can* be proved here is the other half: that this project reads a rendered file correctly, and reports length, peak and RMS from it.
 * A comparison built on a reader nobody has tested measures the reader as much as the renderer.
 *
 * Deliberately small: PCM 16/24/32-bit integer and 32-bit float, which is what sfizz and this project's own exporter write.
 */
import { readFileSync } from "node:fs";

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;

/** @returns {{ sampleRate: number, channels: number, frames: number, data: Float32Array[], peak: number, rms: number }} */
export function readWav(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 44) throw new Error(`${path} is too short to be a WAV file`);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} is not a RIFF/WAVE file`);
  }

  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = bytes.readUInt16LE(body);
      channels = bytes.readUInt16LE(body + 2);
      sampleRate = bytes.readUInt32LE(body + 4);
      bits = bytes.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataStart = body;
      // A streamed writer may leave the size at 0; trust the file length then, which is what a reader has to do anyway.
      dataLength = size > 0 ? Math.min(size, bytes.length - body) : bytes.length - body;
    }
    offset = body + size + (size % 2);
  }

  if (!channels || !sampleRate || !bits || dataStart < 0) throw new Error(`${path} is missing a fmt or data chunk`);
  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * channels));
  const data = Array.from({ length: channels }, () => new Float32Array(frames));

  let peak = 0;
  let sumSquares = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const at = dataStart + (frame * channels + channel) * bytesPerSample;
      let value;
      if (format === FORMAT_FLOAT && bits === 32) value = bytes.readFloatLE(at);
      else if (bits === 16) value = bytes.readInt16LE(at) / 32768;
      else if (bits === 24) {
        const raw = bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
        value = ((raw << 8) >> 8) / 8388608;
      } else if (bits === 32) value = bytes.readInt32LE(at) / 2147483648;
      else throw new Error(`${path}: unsupported ${bits}-bit sample format`);
      data[channel][frame] = value;
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
      sumSquares += value * value;
    }
  }

  return {
    sampleRate,
    channels,
    frames,
    data,
    peak,
    rms: frames > 0 ? Math.sqrt(sumSquares / (frames * channels)) : 0,
  };
}

/** The largest absolute sample-to-sample difference between two renders, and where it is. Used by every "these two agree" criterion. */
export function maxDifference(a, b) {
  const channels = Math.min(a.channels, b.channels);
  const frames = Math.min(a.frames, b.frames);
  let max = 0;
  let at = -1;
  let channel = -1;
  for (let c = 0; c < channels; c += 1) {
    for (let frame = 0; frame < frames; frame += 1) {
      const difference = Math.abs(a.data[c][frame] - b.data[c][frame]);
      if (difference > max) {
        max = difference;
        at = frame;
        channel = c;
      }
    }
  }
  return { max, frame: at, channel, comparedFrames: frames, comparedChannels: channels };
}
