# AUDIO_PLAN

Web Audio API directly. No audio library (`TECH_STACK.md` §4).

---

## 1. Graph

```
AudioContext
├─ masterGain ──▶ destination
│    ├─ musicGain
│    ├─ sfxGain          ──▶ (pooled one-shot voices, positioned)
│    ├─ ambienceGain     ──▶ ambienceA / ambienceB (crossfade pair)
│    ├─ uiGain
│    └─ vehicleGain      ──▶ per-vehicle sub-bus (engine loop + tyre loop + horn)
```

- Each bus is a `GainNode` bound to a settings slider (`UI_ARCHITECTURE.md` §7). Volume changes use `setTargetAtTime` (no clicks).
- Positional audio uses `PannerNode` (`HRTF` off, `equalpower` — cheaper and adequate) with distance model `linear`, `refDistance` 4 m, `maxDistance` 90 m. `AudioListener` position/orientation is updated from the camera each frame.
- Voice pool: **24 concurrent one-shot voices**, allocated at boot. On exhaustion the quietest/oldest voice is stolen. No `AudioBufferSourceNode` is ever created in a loop path beyond the pool's fixed set.
- A global one-shot rate limiter per sound id (e.g. horns ≤3/s, footsteps ≤6/s) prevents machine-gunning.

## 2. Autoplay policy compliance

Browsers require a user gesture. Therefore:
1. `AudioContext` is created **suspended** during boot.
2. The first click/keypress calls `resume()`.
3. Until then, a small persistent notice says "Click to enable sound".
4. If `resume()` fails, the game runs silently with a dismissible notice — never blocked, never a crash (`ARCHITECTURE.md` §8, degraded tier).
5. `visibilitychange → hidden` suspends the context; returning resumes it (also honours the mute-on-blur setting).

## 3. Sound set (MVP)

| Category | Sounds | Notes |
|---|---|---|
| Ambience beds | `amb_market_day`, `amb_street_day`, `amb_residential_day`, `amb_night`, `amb_palace` | 20–40 s seamless loops, mono, crossfaded |
| Footsteps | 4 variants × 2 surfaces (paving, dirt) | triggered by walk/run cycle phase, not by a timer |
| Player | jump, land, cloth rustle | quiet, supportive |
| Vehicle | auto engine loop, idle loop, tyre/road loop, horn, door/entry thump, impact ×3 | see `VEHICLE_ARCHITECTURE.md` §7 |
| Traffic | distant traffic layer (part of ambience), AI horns ×3 | positioned, rate-limited |
| World | temple bell (time-based), crows, vendor call ×3, dog bark, distant train | scheduled random one-shots, weighted by zone and hour |
| UI | click, back, toast, mission accept, mission complete, level up, save | non-positional, `uiGain` |
| Music | one soft ambient theme (menu/loading), one short mission-complete sting | duck ambience by 4 dB while playing |

Total MVP audio download target: **≤ 3.5 MB** (see §5).

## 4. Ambience mixing

Two ambience slots crossfade over 2–4 s. The target bed is chosen at 2 Hz from `(zoneAtPlayer, timePhase)`. Zone comes from the authored zone polygons; a small hysteresis prevents flapping at zone borders. Layered on top: a low-frequency traffic murmur whose gain follows the number of nearby traffic agents, and a scheduled one-shot generator (temple bell near the hour, crows at dawn, vendor calls in the market during the day).

This is where the "living city" feeling actually comes from, at a cost of a few gain automations per second.

## 5. Loading strategy

Audio is loaded **lazily and in tiers**, so it never delays first playability:

| Tier | Loaded | Contents |
|---|---|---|
| 0 — boot | during the loading screen | UI clicks, one ambience bed for the start zone (~500 KB) |
| 1 — first frames | after the loading screen, idle-time | footsteps, player, vehicle loops, remaining day ambience |
| 2 — on demand | when first needed | night ambience, weather, music, rare one-shots |

- Format: **`.ogg` (Vorbis) primary, `.m4a` (AAC) fallback**, chosen by `canPlayType` at boot. Both are royalty-free to *play* and universally supported across our target browsers (`BROWSER_COMPATIBILITY.md`); Opus-in-WebM is smaller but has weaker Safari history, so it is an optional third variant, not the primary.
- Mono for everything positional (half the bytes, and panning is applied anyway); stereo only for music and ambience beds.
- 44.1 kHz for music, 32 kHz for effects, target bitrate ~96 kbps ambience / ~64 kbps effects.
- Decoded buffers are cached by asset key with reference counting; Tier 2 buffers may be released if unused for 5 minutes (guarded so a bed in use is never freed).
- A failed audio load is a **degraded** error: log the key, continue silent for that sound, never retry in a loop.

## 6. Licensing

Every audio file is tracked in `public/audio/CREDITS.md` with source, author, licence, URL and modifications — same discipline as models (`ASSET_PLAN.md` §Licensing). Preferred sources: CC0 / public-domain libraries, or originally recorded/synthesised material. **No unknown-licence audio, no ripped game or film audio, no music with attribution-incompatible terms.** Attribution-required (CC-BY) assets are acceptable and are surfaced in the in-game credits panel.

## 7. Performance rules

- ≤24 concurrent voices; ≤8 positional loops (vehicle buses included).
- A vehicle's bus is disconnected (not just muted) beyond 60 m or when its agent is far-tier — disconnected nodes cost nothing.
- No per-frame audio work: mixing decisions are 2 Hz, listener updates are a few property writes per frame.
- No convolution reverb, no dynamics processing, no analyser nodes, no filters per voice in the MVP. One shared low-pass on the ambience bus for the "indoors/under-canopy" effect is the only allowed processing, and only if it earns its keep.
- Decoding happens once at load (`decodeAudioData`), never mid-gameplay for Tier 0/1 assets.

## 8. Accessibility

Independent master/music/SFX/ambience sliders; mute-on-blur default on; no information conveyed by sound alone (horns and prompts always have a visual counterpart); subtitles cover all dialogue (`UI_ARCHITECTURE.md` §8).

## 9. Explicitly not built

3D reverb zones, occlusion/obstruction filtering, dynamic music systems, procedural engine synthesis, voice acting, spatial HRTF, audio middleware.
