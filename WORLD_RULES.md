# World and character guidance

Choose world assets, art style, palette, camera and rendering approach to fit
the requested game. The SDK's scenery, world presets and `GameWorld` renderer
are optional building blocks. You can author your own world and assets while
using the SDK runtime, selected Friend and fixed game actions.

## Default game experience

Unless otherwise requested, deliver only the game component in the user's current
project. The player controls their owned Rare Friend through keyboard and touch
movement in a playable world. Place requested activities at interactable locations
or objects: for example, a vendor to buy packs and a table to open them. Supporting
menus handle those interactions; they do not replace the world with a page or
dashboard. Do not add unrequested activities, site navigation, footers, About/Store
pages or another application's frontend. Preserve the ownership and simulated
economy requirements in [AGENTS.md](AGENTS.md).

## Movement and interaction

Fit the world and its menus inside the SDK's 960 × 640 game container. Keep
movement, collision, pointer coordinates and depth ordering consistent with your
chosen camera. Visible obstacles and interaction prompts should match their
collision shapes and usable areas. Support keyboard and touch, readable controls,
mute, reduced motion, loading, errors and retry.

Pause movement and game input when the runtime's `paused` prop is true, and stop
held movement on blur or hidden tabs. Validate movement along its full path so a
large frame step cannot cross an obstacle. Define how the player reaches separate
areas or crosses gaps as part of the game's rules.

## Rare Friend character artwork

Use the selected Friend's canonical sprites from the SDK's sprite reader.
Character identity and pixels remain consistent across games; the surrounding
world's art direction is yours. Artwork does not prove ownership; the runtime
verifies the connected account separately.

Canonical walking Friends are 16 × 16 one-bit masks. Preserve frame order and
select direction explicitly. Draw square pixels at integer scale and integer
screen placement. Native stills use 5× pixels, an 80 × 80 box, and an anchor at
horizontal center / row 15.

Preserve the original black mask and a white one-pixel halo, clipped to the
16 × 16 box. Never rotate, skew, stretch, merge, smooth, recolor or generate
replacement character pixels. Genesis 8 × 8 portraits are a separate collection,
not substitute walking bodies. Colossus has no up/down frames; use the SDK's
explicit horizontal fallback.

## Optional SDK world renderer

`GameWorld`, `@rarefriends/friendsdk/world`, `navigation`, `movement` and
`loadWorldAssets` provide a ready-made implementation for the supplied world
format. The details below apply when using those utilities. A custom renderer
can use its own world format, camera and visual effects.

### Coordinates and projection

The supplied renderer uses a 576 × 384 ground plane and 1600 × 1200 native
exports, with this shallow projection:

```text
screenX = 800 + 1.5 × 0.8660254038 × (x - y - 96)
screenY = 690 + 1.5 × 0.28 × (x + y - 480) - lift
```

When using it, pair `project` with `unproject` for drawing and pointer input.
Crop or uniformly scale the composition to fit the game frame. A vertical lift
is a screen-space offset; inverse projection for walking assumes `lift = 0`.
Upright props and characters sort by their ground anchor's `x + y`.

### Presets and color options

Supplied presets contain editable off-chain scene data. The renderer provides
monochrome scenery with signal green `#CCFF00`, or its `GAME_PALETTE` through
`{ color: true }`. These are options for the supplied artwork; your game can
choose its own colors, textures, effects and world assets.

```js
import { getWorldPreset, renderWorld, renderProp } from '@rarefriends/friendsdk/world';

const world = getWorldPreset('01-garden-oval-complete');
const svg = renderWorld(world, { color: true });
const tree = renderProp('tree', { color: true });
```

### Geometry and loading variants

The SDK world format describes ground polygons, holes, paths, prop footprints
and blocked areas. Its navigation utilities use these shapes for collision;
`validateWorld` checks the scene definition. `renderWorldLayers` separates terrain
and objects for depth-sorted animation. Games define interactions, reach and
object-specific behavior.

Optional loading variants use a 48 × 48 construction grid with `void`,
`wireframe` and `floating` chunks. Those variants remove ground, paths, textures
and props at missing chunks. Custom worlds can present their own loading states.

## Asset delivery and review

Include the world assets your game uses and record their sources and permissions.
Keep editable source files in the game directory and load assets within the
sandbox's serving policy. Do not insert raw SVG supplied by players into the page.

Review the playable result on phones and computers: character readability,
clipping, collision, interaction reach, front/back ordering, loading and error
states. When using the SDK world format, validate edited scenes and record prop
anchors and collision footprints. Document any custom renderer or asset build
steps with the game's run instructions.
