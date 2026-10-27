# CoasterLab — Implementation Plan

**Project name:** CoasterLab
**Folder:** `/Volumes/ External Drive 256G/Dev2/opencode/coasterlab`
**Type:** Static educational SPA/PWA
**Runtime AI:** None. No LLM/API calls after build. All physics runs in the browser.
**Target learners:** Grades 8–11 (Korean 중2~고2)
**Subject:** Physics — energy conservation, friction, circular motion, normal force, G-force
**MVP duration:** 3–4 weeks

---

## 0. One-page summary

CoasterLab is a roller-coaster design studio where students draw a track, run a cart, and read the energy and G-force graphs. The goal is not to build the prettiest coaster; it is to design a track that completes the ride safely while explaining **why** it works.

Students work in a side-view editor first, then inspect the same track in 3D. Every run produces:

- Speed and height over distance.
- Kinetic, potential, and thermal energy.
- Normal force and G-force.
- A safety report: too slow for the loop, too much G-force, derailment risk.

The app is **not** an AI tutor. Its feedback is deterministic and tied to the physics model. A "comfort mode" and a clear "idealized model" label keep the experience honest and usable.

**Why this is a strong build**

- Combines a creative editor, real physics, 3D rendering, and data visualization.
- Physics is testable: energy conservation and G-force have exact expected values.
- The design loop is inherently iterative: build, test, read the graph, improve.
- Works with procedural geometry; no external assets.

---

## 1. Product definition

### 1.1 Learning problem

Students can state "energy is conserved" but struggle to apply it to a moving object on a curved track. They also confuse speed, acceleration, and G-force, and they often think a loop only needs to be tall enough.

### 1.2 Learning goals

By the end of the core missions, a student should be able to:

- Apply conservation of mechanical energy to a cart on a track.
- Explain how friction converts mechanical energy into thermal energy.
- Relate centripetal acceleration to speed and radius.
- Predict where a rider feels the greatest and least G-force.
- Identify why a loop needs a minimum entry speed.
- Explain why a track that looks exciting can be unsafe.

### 1.3 Core learning loop

1. **Design** — place control points or choose a track piece.
2. **Predict** — the mission asks where the cart will be fastest, slowest, or heaviest.
3. **Run** — simulate the cart and show the graphs.
4. **Explain** — answer a question using the graph.
5. **Improve** — adjust the track to satisfy a constraint.

### 1.4 Success criteria

- A student can point to the energy graph and explain the speed at the bottom of a hill.
- A student can explain why the top of a loop has the lowest normal force.
- A student can fix a track that is too slow for its loop.
- A teacher can reset progress and select missions without code changes.

---

## 2. Scope

### MVP (must ship)

- Side-view track editor with draggable control points.
- Catmull-Rom spline track with smooth curves.
- At least three piece types: hill, loop, banked turn (or a simple 3D curve).
- Cart simulation with gravity, friction, and normal force.
- Energy graph, speed graph, and G-force graph.
- Safety report: insufficient speed, excessive G-force, track self-intersection.
- 3D visualization with a follow camera and an orbit camera.
- Five missions with prediction gates.
- Comfort mode and reduced motion.
- Local progress, teacher reset.
- Responsive layout and keyboard editing.
- PWA install + offline cache.

### Later (do not build in the first pass)

- Full 3D track editing in arbitrary orientation.
- Multiple cars or trains.
- Launch, brake, and lift-hill components.
- Track sharing via URL or file export.
- Classroom leaderboard.
- Realistic rider physics or comfort modeling.

### Out of scope

- Any server, database, login, or analytics.
- Any runtime AI or generated feedback.
- Engineering-grade safety certification.
- Real coaster manufacturer data.
- VR.

---

## 3. Tech stack

| Layer         | Choice                          | Reason                             |
| ------------- | ------------------------------- | ---------------------------------- |
| Build         | Vite + TypeScript               | Static output, fast iteration      |
| 3D            | Three.js                        | Track mesh, cart, cameras          |
| Editor        | SVG or Canvas 2D                | Precise control points and handles |
| Graphs        | Canvas 2D or SVG                | Lightweight real-time plots        |
| Math tests    | Vitest                          | Physics and spline tests           |
| Browser tests | Playwright                      | Editing, simulation, screenshots   |
| PWA           | `vite-plugin-pwa`               | Offline classroom use              |
| Hosting       | GitHub Pages / Cloudflare Pages | No server                          |

**Constraints**

- Node.js 20+.
- No backend, no API keys, no runtime network calls.
- No external 3D models or textures.
- Target 60 fps on a mid-range laptop; ≥ 30 fps on a school tablet.
- Initial gzip bundle under 800 KB.

---

## 4. Architecture

### 4.1 Module map

```text
src/
  main.ts
  app/
    App.ts
    state.ts
    routes.ts
  track/
    types.ts
    spline.ts             Catmull-Rom sampling and arc length
    pieces.ts             hill, loop, banked turn presets
    validation.ts         continuity, self-intersection, radius
    geometry.ts           track mesh and rails
  physics/
    constants.ts          gravity, friction, mass
    cart.ts               1D motion along the track
    energy.ts             kinetic, potential, thermal
    forces.ts             normal force and G-force
    integrate.ts          fixed-step integrator
    safety.ts             constraint checks
  render/
    SceneManager.ts
    TrackView.ts
    Cart.ts
    CameraRig.ts
    Sky.ts
    debug.ts
  editor/
    SideViewEditor.ts     control points, handles, grid
    Toolbar.ts
    numericInputs.ts
  graphs/
    GraphPanel.ts
    energyGraph.ts
    speedGraph.ts
    gForceGraph.ts
  features/
    missions/
    teacher/
  data/
    missions.json
  ui/
    components/
    styles/
  storage/
    progress.ts
  tests/
    unit/
    e2e/
```

### 4.2 Coordinate system

- Use a right-handed 3D coordinate system.
- The MVP track is primarily in the XY plane (side view), with optional Z offset for banking.
- `y` is height; `x` is horizontal distance; `z` is depth.
- Track parameter `s` is arc length in meters.
- The cart has a position `p(s)`, a tangent `T(s)`, a normal `N(s)`, and a binormal `B(s)`.

### 4.3 State

```ts
interface AppState {
  route: 'design' | 'missions' | 'teacher';
  track: {
    controlPoints: Vec3[];
    selectedPoint: number | null;
    presets: string[];
  };
  simulation: {
    running: boolean;
    time: number;
    cartS: number; // arc-length position
    speed: number;
    samples: Sample[]; // recorded run data
  };
  view: 'editor' | '3d';
  camera: 'follow' | 'orbit' | 'side';
  comfortMode: boolean;
  mission: {
    currentId: string | null;
    answers: Record<string, string>;
    completed: string[];
  };
  preferences: {
    reducedMotion: boolean;
    showForces: boolean;
    units: 'metric';
  };
}
```

### 4.4 Persistence

- `localStorage` key: `coasterlab.progress.v1`.
- Store the current track, mission progress, and preferences.
- Track data is small (control points), so JSON is enough.
- No personal data.
- Teacher reset clears progress after confirmation.

---

## 5. Data model

### 5.1 Track

```ts
interface TrackPoint {
  x: number;
  y: number;
  z?: number;
  locked?: boolean; // start/end anchors
}

interface Track {
  id: string;
  nameKo: string;
  points: TrackPoint[];
  friction: number; // coefficient
  gravity: number; // m/s²
  startSpeed: number; // m/s
  loop?: {
    startS: number;
    endS: number;
    radius: number;
  };
}
```

### 5.2 Simulation sample

```ts
interface Sample {
  s: number; // arc length
  t: number; // time
  x: number;
  y: number;
  speed: number;
  kinetic: number;
  potential: number;
  thermal: number;
  normalForce: number;
  gForce: number;
  curvature: number;
}
```

### 5.3 Mission

```ts
interface Mission {
  id: string;
  titleKo: string;
  concept: 'energy' | 'friction' | 'circular' | 'g-force' | 'safety';
  promptKo: string;
  trackPreset: string;
  prediction: {
    options: string[];
    answer: string;
  };
  explanationKo: string;
  takeawayKo: string;
  difficulty: 1 | 2 | 3;
}
```

### 5.4 Constants

```ts
const GRAVITY = 9.81; // m/s²
const CART_MASS = 500; // kg, for display only
const MAX_G = 6; // safety threshold for the educational model
const MIN_LOOP_SPEED_FACTOR = 1.0; // v² >= gR at the top
```

Keep constants in one file with units and comments.

---

## 6. Core algorithms

### 6.1 Spline and arc length

1. Use a Catmull-Rom spline through the control points.
2. Sample the spline densely (e.g. 200 samples per segment).
3. Compute cumulative arc length.
4. Build a lookup table from `s` to spline parameter.
5. Resample at a fixed spatial step for stable physics.

**Test:** total arc length of a straight line equals the distance between endpoints; a circular arc approximates `r × θ`.

### 6.2 Track frame

- Tangent: normalized derivative.
- Normal: perpendicular to the tangent in the track plane, pointing toward the center of curvature.
- Binormal: `T × N`.
- For banking, rotate the normal/binormal around the tangent by the bank angle.

Use a stable frame construction to avoid flipping at inflection points. If the curvature is near zero, keep the previous normal.

### 6.3 Physics model

Use a 1D energy model along the track:

```text
E_mech = 0.5 × m × v² + m × g × y
E_thermal += friction force × distance
E_mech + E_thermal = constant
```

Friction force:

```text
F_friction = μ × m × g × cos(θ)
```

where `θ` is the track slope. Use a simple constant coefficient for the MVP.

Speed at each step:

```text
v = sqrt(max(0, 2 × (E_mech - m × g × y) / m))
```

If the speed reaches zero before the end, the cart stops and the run ends with a "stalled" report.

### 6.4 Normal force and G-force

- Centripetal acceleration: `a_c = v² / r`, where `r` is the local radius of curvature.
- Normal force for a track that can push or pull:
  `N = m × (v² / r + g × cos(θ))` for a valley; sign conventions matter.
- Define G-force as `N / (m × g)`.
- At the top of a loop, the required condition is `v² ≥ g × r`.
- If `N < 0` on a section where the track cannot hold the cart, flag "derailment risk."
- For the MVP, use a simplified "track pulls the cart" model and show a warning rather than a full derailment simulation.

**Test:** at the top of a vertical loop with `v² = gR`, G-force is 0; with `v² = 2gR`, G-force is 1.

### 6.5 Integrator

- Use a fixed timestep (e.g. 1/120 s) with an accumulator.
- Semi-implicit Euler is enough for the MVP; RK4 is optional.
- Clamp speed and position to avoid NaN.
- Stop the simulation if the cart leaves the track or stalls.
- Cap the simulation at a fixed number of seconds to prevent infinite loops.

### 6.6 Track validation

Check:

- The track has at least two points.
- The start is higher than the end (unless a lift is added later).
- Adjacent points are not coincident.
- The spline does not self-intersect in the side view.
- The loop radius is positive and the entry speed is sufficient.
- The maximum G-force is within the educational threshold.

Show validation as a checklist, not a single pass/fail.

### 6.7 Graphs

- Plot energy vs distance: kinetic, potential, thermal, total.
- Plot speed vs distance.
- Plot G-force vs distance.
- Add a vertical marker at the cart's current position.
- Use fixed axes or auto-scaling with a smooth transition; avoid jitter.
- Use a color-blind-safe palette and line styles.

---

## 7. Screens and UX

### 7.1 Design screen

- Top toolbar: preset tracks, new, save, run, reset.
- Center: side-view editor with a grid, control points, and tangent handles.
- Right panel: track properties (friction, start speed), validation checklist.
- Bottom: graphs, collapsed by default on phone.

### 7.2 3D view

- Track mesh with rails and supports.
- Cart with a simple rider silhouette.
- Follow camera, orbit camera, and side camera.
- Speed lines or motion cues, optional and disabled in comfort mode.
- Force arrows toggle: gravity, normal force, velocity.

### 7.3 Mission screen

- Mission card with a prediction question.
- The mission loads a preset track.
- The student runs the simulation and answers.
- The explanation references the graph.
- Completion award and takeaway.

### 7.4 Teacher mode

- Select missions.
- Show answers and explanations.
- Reset progress.
- Toggle graph labels and force arrows for projection.
- Print a worksheet with the preset track and questions.

### 7.5 Responsive layout

**Desktop (≥ 1024 px)**

- Editor and 3D view side by side or tabbed.
- Graphs in a bottom panel with three columns.

**Tablet (768–1023 px)**

- Editor on top, graphs below, narrow property panel.
- Touch handles with larger hit areas.

**Phone (< 768 px)**

- Editor only in portrait; 3D and graphs in tabs.
- Numeric inputs for control points as a fallback to dragging.
- Run button sticky at the bottom.

### 7.6 Accessibility

- Keyboard: `Tab` selects control points, arrow keys move them, `Enter` runs.
- Numeric inputs for every control point coordinate.
- Every graph has a data table alternative.
- Respect `prefers-reduced-motion`: no camera shake, no speed lines, instant camera cuts.
- Comfort mode reduces FOV changes and camera acceleration.
- Use text labels for G-force zones, not color alone.
- Provide a "read the track" summary: height, length, max speed, max G.

---

## 8. Implementation milestones

### M0 — Setup (0.5 day)

- Scaffold Vite + TypeScript + Three.js.
- Add Vitest, Playwright, ESLint, Prettier, PWA plugin.
- Create the module map and a blank scene.
- **Verify:** dev server, build, and tests run.

### M1 — Spline and track core (3–4 days)

- Implement Catmull-Rom sampling, arc length, and the `s` lookup.
- Build the track frame with stable normals.
- Implement track validation.
- Write unit tests for straight lines, arcs, and self-intersection.
- **Verify:** a preset hill produces a smooth track and a stable frame.

### M2 — Physics (3–4 days)

- Implement energy, friction, speed, normal force, and G-force.
- Implement the fixed-step integrator.
- Add stall, derailment, and G-force warnings.
- Write tests for energy conservation and the loop condition.
- **Verify:** a frictionless track conserves mechanical energy within 1%.

### M3 — Editor UI (3–4 days)

- Build the side-view editor with draggable control points.
- Add add/remove point, presets, and numeric inputs.
- Add the validation checklist.
- **Verify:** a student can build a simple hill and run it.

### M4 — 3D view and graphs (3–4 days)

- Build the track mesh, rails, supports, and cart.
- Add follow/orbit/side cameras.
- Add force arrows and comfort mode.
- Build the three graphs with a current-position marker.
- **Verify:** the cart and graph marker stay synchronized.

### M5 — Missions and teacher mode (2–3 days)

- Author five missions.
- Add prediction gates, explanations, and progress persistence.
- Add teacher reset and answer key.
- **Verify:** every mission can be completed from a fresh state.

### M6 — Responsive, accessibility, PWA (2 days)

- Implement the three layouts.
- Add keyboard editing and numeric inputs.
- Add data tables for graphs.
- Configure offline caching.
- **Verify:** keyboard-only track edit and run; offline reload.

### M7 — QA and pilot (2 days)

- Run all tests and screenshot checks.
- Test on a low-end tablet.
- Ask 3–5 students to try the energy and loop missions.
- Fix the top usability issues.
- Deploy.
- **Verify:** acceptance criteria below are met.

---

## 9. Testing and verification

### Unit tests (Vitest)

- Catmull-Rom interpolation passes through control points.
- Arc length of a straight line equals the endpoint distance.
- Arc length of a circular arc approximates `r × θ`.
- Frictionless energy conservation within 1%.
- Friction converts the expected amount of energy.
- Speed at the bottom of a hill matches `sqrt(2gh + v0²)`.
- Loop condition: at the top, `v² ≥ gR`.
- G-force at the top of a loop with `v² = gR` is 0.
- Integrator does not produce NaN for extreme inputs.
- Track validation rejects coincident points and self-intersections.

### Interaction tests (Playwright)

- Drag a control point and confirm the track updates.
- Add and remove points.
- Run the simulation and confirm the graphs update.
- Switch between editor, 3D, and graphs.
- Complete a mission correctly and incorrectly.
- Reset progress in teacher mode.
- Keyboard-only edit and run.

### Visual tests

- Screenshot the default track, a loop, and a G-force warning state.
- Screenshot the graphs at the end of a run.
- Run at 1440×900, 1024×768, and 390×844.
- Check that the cart is visible and the camera does not clip through the track.

### Accessibility checks

- `axe-core` scan with no critical issues.
- Keyboard reaches every control.
- Graphs have data tables.
- Reduced motion disables speed lines and camera flights.
- Comfort mode is discoverable and persistent.

### Performance budget

- 60 fps on a mid-range laptop; ≥ 30 fps on a school tablet.
- Track mesh rebuilt only when points change.
- Graph drawing uses a fixed sample count, not every physics step.
- Pause rendering when the tab is hidden.
- Initial load < 2.5 s on simulated 4G.

---

## 10. Acceptance criteria / Go-No-Go

- [ ] A student can build a track with at least five control points.
- [ ] The spline passes through the control points and has stable frames.
- [ ] A frictionless run conserves mechanical energy within 1%.
- [ ] The loop G-force matches the analytical formula within tolerance.
- [ ] The app detects a too-slow loop, excessive G-force, and self-intersection.
- [ ] Five missions are playable, scored, and saved locally.
- [ ] Teacher reset works.
- [ ] The 3D view and graphs stay synchronized.
- [ ] Comfort mode and reduced motion work.
- [ ] Keyboard-only editing and running work.
- [ ] The app works offline after the first load.
- [ ] No runtime network calls to an AI service or backend.
- [ ] The "idealized model" label is visible.

If energy conservation or loop physics fails, stop and fix the model before adding missions.

---

## 11. Risks and mitigations

| Risk                                                        | Impact                         | Mitigation                                                             |
| ----------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Physics model is too simplified and teaches wrong intuition | Mislearning                    | Label the model; test against analytical cases; keep friction optional |
| Track frames flip at inflection points                      | Visual glitches and bad forces | Stable frame construction; fallback to previous normal                 |
| Editor is hard to use on touch                              | Tablet unusable                | Large handles; numeric inputs; add/remove via buttons                  |
| 3D camera causes motion sickness                            | Discomfort                     | Comfort mode; instant cuts; no shake                                   |
| Self-intersection and loop validation are incomplete        | Unsafe-looking tracks pass     | Checklist of multiple conditions; visual warnings                      |
| Graphs jitter or scale poorly                               | Hard to read                   | Fixed axes or smooth auto-scale; decimate samples                      |
| Scope creep into full 3D editing                            | Delays MVP                     | Side-view editor first; 3D is a visualization, not an editor           |
| Performance drops on long tracks                            | Unusable in class              | Arc-length LUT; fixed physics step; decimated rendering                |

---

## 12. AI build guide

Use the AI coding agent for scaffolding, spline/physics implementation, tests, UI, and screenshot-driven fixes. Physics is the highest-risk area; do not accept generated physics without analytical tests.

### Recommended build order

1. Scaffold Vite + TypeScript + Three.js with tests.
2. Implement the spline and arc-length math with tests.
3. Implement energy, friction, normal force, and G-force with tests.
4. Build the side-view editor and presets.
5. Build the 3D track mesh and cart.
6. Add cameras and comfort mode.
7. Add graphs and the current-position marker.
8. Add missions and teacher mode.
9. Do responsive/accessibility passes.
10. Use screenshots at three viewports and fix visual regressions.

### Prompt rules

- State the constraint: “No backend, no runtime AI, no network calls.”
- Require analytical tests for every physics formula.
- Ask the agent to derive the loop condition before coding it.
- Give exact expected values for energy and G-force tests.
- Keep the physics step deterministic and independent of frame rate.
- Provide screenshots when fixing camera or track-mesh issues.

### What not to delegate

- The decision that the physics is correct.
- The safety thresholds and their wording.
- The final review of the G-force graph.
- Accessibility judgment.
- Classroom pilot feedback.

### Definition of done

- All physics and interaction tests pass.
- The acceptance checklist is complete.
- A teacher can run the five missions without developer help.
- The idealized nature of the model is visible in the UI.

---

## 13. Future extensions

- Full 3D track editing.
- Lift hills, brakes, and launches.
- Multiple cars and trains.
- Track sharing via URL or JSON file.
- Realistic rider comfort model.
- Classroom leaderboard with local-only data.
- Export a run report as a printable PDF.
- Localization.

---

## 14. References

- Three.js documentation: https://threejs.org/docs/
- MDN Web APIs: https://developer.mozilla.org/en-US/docs/Web/API
- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- Standard high-school physics references for energy conservation and circular motion.
- Catmull-Rom spline references: standard computer graphics texts.

---

**Plan version:** 1.0
**Created:** 2026-10-27
**Next step:** scaffold the project, then implement M1 (spline + tests) and M2 (physics + tests) before building the editor.
