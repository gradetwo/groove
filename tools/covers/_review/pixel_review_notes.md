# pixel review running notes (subagent)
probe: all 156 batch tiles nearMAD<=1.45 => genuinely 160px-post-pixelated. 3 pilots (chiptune,lofi-hip-hop,vaporwave) nearMAD 4.6-4.8 => NOT post-processed; no sidecar.
ACCEPT: 2-step-garage acid-house acid-jazz acid-techno afrobeat afro-house(warn R2 warm red) alternative-rock ambient-dub ambient-techno
 REJECT: alternative-rnb (R4 lone-mic cliche + R1 weak) | amapiano (R1 generic drum+whisky, R2 warm brown) | ambient (R3 mush/soft fog, R1 no music)
ACCEPT: bachata bass-house bassline bebop big-beat black-metal blues-rock boom-bap bossa-nova breakbeat breakcore(dup check) 
 REJECT: brooklyn-drill (R3 GARBLED TEXT on bodega sign "LECNDIEF")
ACCEPT: brostep chicago-drill chicago-house chillwave chiptune city-pop conscious-hip-hop contemporary-rnb cool-jazz
 REJECT: chicago-blues (R1 ORCHESTRAL HARP rendered for blues "harp"=harmonica) | cloud-rap (R1 unidentifiable shoe/object, R3 blob in empty frame)
 CANDIDATE: chillstep (R1 no instrument, headphones+mug generic; R4 rainy-window cliche)
ACCEPT: cumbia dancehall(small badge) death-metal deathstep deep-house delta-blues(green/tan drift) detroit-techno disco doom-metal downtempo dream-trance drift-phonk
DETAIL CHECK: brooklyn-drill sign = LEGIBLE pseudo-word -> R3 reject. dancehall badge = abstract, ok. doom-metal/hard-rock amp script = abstract cursive, ok. jersey-drill sign = degraded blobs, ok. gypsy-jazz = violin/fiddle (not cello) ok.
ACCEPT: dub dubstep dub-techno east-coast-hip-hop edm-trap electric-blues electro-house electro emo-rap(minor garble) eurodance euro-trance footwork
ACCEPT: free-jazz?NO->reject. frenchcore funk future-bass future-house g-funk glitch-hop goa-trance grime
CANDIDATES: chillstep(R1/R4) free-jazz(R3 garbled prone figure,no focal) french-house(R1 unidentifiable object) future-garage(R1/R3 empty) ghetto-house(R1/R3 bulb+empty floor) idm(R3 mush,R1) j-pop(R4 flat geometry,R1) microhouse(R1/R3 tiny subject huge empty) post-dubstep(R1 abstract,R3 empty) progressive-house(R1/R3 thin diagonal on empty field)
ACCEPT: grunge gypsy-jazz halftime happy-hardcore hard-bop hardcore-gabber hard-rock hardstyle hard-techno hard-trance hard-trap heavy-metal
ACCEPT: hybrid-trap industrial-techno(low-contrast warn) jazz-fusion jersey-club(jersey-drill) jungle jump-up kawaii-future-bass(bright pastel warn) k-pop kuduro
ACCEPT: liquid-dnb lofi-hip-hop lofi-house math-rock melodic-dubstep melodic-house metalcore minimal-techno modal-jazz moombahton motown
ACCEPT: neo-soul neurofunk new-wave nu-disco-house old-school-hip-hop peak-time-techno phonk post-punk progressive-rock progressive-trance
ACCEPT: psytrance punk-rock ragga-jungle raw-techno reggae(R4 postcard warn) reggaeton riddim?NO->reject rock-and-roll salsa(dense warn) samba sambass schranz
REJECT: riddim (R3 ~80% empty dark field, tiny coil; R1 weak)
ACCEPT: shoe-gaze(bright ink-dither ok) smooth-jazz southern-hip-hop speedbass speed-garage synth-pop synthwave tech-house(empty-ish warn) techstep tech-trance
REJECT: soul (R2 warm brown dominates, pd=0.411 highest in skin; R3 garbled gold pseudo-lettering on piano nameboard)
NOTE: breakcore/tearout-dubstep triage "duplicate" = FALSE POSITIVE (viewed both: different subject/composition). But the "explosion" motif recurs ~8x in the skin (R4 note, not rejected).
