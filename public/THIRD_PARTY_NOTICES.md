# Third-party notices — vendored GS-1 core

Groove Lab bundles the GROOVE SYNTH GS-1 audio core (`vendor/gs1/`) so the `chords` and `lead`
track roles can be voiced by a polyphonic instrument. GS-1's WASM module links two MIT-licensed
DSP libraries directly into its binary, and **neither library's notice ships with the upstream
build artifacts** — GS-1 publishes its own `LICENSE` but not theirs. Supplying this file is
therefore a redistribution obligation we carry, not an optional courtesy.

## What is actually shipped

| Component | Version / pin | License | Where it ends up |
| :--- | :--- | :--- | :--- |
| GROOVE SYNTH GS-1 | `2.1.4` @ commit `2b5b3550` (ABI 8) | MIT | `vendor/gs1/` → bundled as hashed assets (`synth_core*.wasm`, `worklet-processor*.js`) |
| [DaisySP](https://github.com/electro-smith/DaisySP) | `599511b7` | MIT (Electrosmith, Corp.) | compiled **into** `synth_core*.wasm` |
| [Plaits](https://github.com/pichenettes/eurorack) sources used by DaisySP | 2016 | MIT (Emilie Gillet) | compiled **into** `synth_core*.wasm` |
| [Soundpipe](https://github.com/PaulBatchelor/Soundpipe) | 1.8.1 | MIT (Paul Batchelor) | compiled **into** `synth_core*.wasm` |

DaisySP modules linked into the core: band-limited (polyBLEP) oscillators, the Huovilainen Moog
ladder filter, the double-sampled state-variable filter, the DC blocker, and `dsp.h`.
Soundpipe modules: `base`, `delay`, `allpass`, `comb`, `revsc`. The exact file list and the
freestanding shim strategy live in the upstream repository at
`crates/synth-core/vendor/VENDOR.md`; the wasm bytes themselves are pinned by SHA-256 in
`vendor/gs1/UPSTREAM.json` and verified by `scripts/check-gs1.mjs` on every run.

The full, unmodified license texts follow. Each one is reproduced verbatim from the upstream
license file that the corresponding library ships with.

---

## GROOVE SYNTH GS-1

MIT License

Copyright (c) 2025 GROOVE SYNTH GS-1 contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## DaisySP and Plaits

DaisySP, copyright (c) 2020 Electrosmith, Corp.

Published under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Plaits, copyright 2016 Emilie Gillet (emilie.o.gillet@gmail.com)

Published under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---

## Soundpipe

The MIT License (MIT)

Copyright (c) 2020 Paul Batchelor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---

## Note on versions

`Soundpipe` is recorded upstream both as 1.8.1 (`VENDOR.md`) and as copyright 2020 in its license
file; `DaisySP`'s own license file also carries the 2015 Soundpipe notice (`Copyright 2015 Paul
Batchelor`). Both years are reproduced above where they appear, rather than normalised, because
inventing a single "correct" year would be a change to someone else's notice.
