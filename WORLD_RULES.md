# FriendSDK world rules

These rules continue the approved Rare Friends Isometric World Assets collection. The SDK reuses its shallow camera, ground geometry, and vector prop artwork. The supplied worlds are editable off-chain assets; the character reader retrieves on-chain sprite pixels. The world presets are not on-chain maps or released games.

## One camera

Design ground coordinates in a 576 × 384 plane. Native exports are 1600 × 1200. The camera is deliberately shallower than a conventional 2:1 isometric grid:

```text
screenX = 800 + 1.5 × 0.8660254038 × (x - y - 96)
screenY = 690 + 1.5 × 0.28 × (x + y - 480) - lift
```

Use the SDK projection and inverse for drawing and pointer input. Crop or uniformly scale the complete composition to fit a game frame. Never independently stretch the two axes. A vertical lift is a screen-space offset; inverse projection for walking assumes lift = 0.

## Palette and surface

The default renderer preserves the original black/white scenery and sparse signal green `#CCFF00`. Games can opt into the shared five-color `GAME_PALETTE`, with black `#000000` outlines and white `#FFFFFF` details:

| Name | Color | Main uses |
| --- | --- | --- |
| `meadow` | `#B9D984` | Ground and trees |
| `pond` | `#7DB4DB` | Water and water props |
| `sun` | `#F2CE68` | Paths, wood, and signals |
| `coral` | `#ED927E` | Slab walls, flowers, and planters |
| `lilac` | `#B3A0D8` | Crystals, machinery, and construction guides |

```js
import { getWorldPreset, renderWorld, renderWorldLayers, renderProp } from '@rarefriends/friendsdk/world';

const world = getWorldPreset('01-garden-oval-complete');
const svg = renderWorld(world, { color: true });
const layers = renderWorldLayers(world, { color: true, signals: false });
const tree = renderProp('tree', { color: true });
```

`propArtwork(type, id, { color: true })` returns the matching prop fragment; use `renderProp` when you need its pattern definitions and a standalone SVG. Omit `color` or set it to `false` for the original artwork. Color changes surface fills and patterns, never geometry, projection, collision, depth order, or canonical Friend pixels. It adds no font or package dependency.

- Keep this palette for colored scenery and game UI. Keep canonical Friend pixels black and white in both modes.
- Use hard outlines, pixel-like steps, and small clipped dither or grid patches. No gradients, soft shadows, blurred edges, or replacement colored character art.
- In the original mode, reserve signal green for currency indicators, small active lights, and unfinished geometry. Color mode uses sun for signals and lilac for construction guides. A colored indicator is not evidence of a paid reward.
- Let a world's silhouette communicate its setting: oval garden, courtyard ring, terraced mesa, rooftop L, separate islands, or hexagonal decks. Keep tall landmarks mostly at the back and leave room for characters and movement.

## Anchors, collision, and depth

Project the ground anchor of a prop or Friend. Keep the object itself upright. Sort all upright objects by `x + y` so a Friend can pass behind a tree. The SDK provides separate terrain and object layers for animated games.

Geometry has explicit outer polygons, courtyard holes, slab depth, and missing chunks. Textures and paths are clipped to the loaded top surface. Ground containment is separate from walking: water patches and solid prop footprints also block a Friend. The SDK supplies conservative default footprints; games can author explicit blocked rectangles for their own props and mechanics. A painted path is decorative unless game rules give it meaning. Disconnected islands need a game-defined route or teleport; never silently walk across a gap.

Run scene validation after editing. A valid anchor must be supported by loaded ground. Validate new movement along its full segment so a large frame step cannot cross a thin obstacle. Rendering is not a physics simulation: games own interactions, reach, slopes, jumps, and object-specific behavior.

## Friends

Canonical walking Friends are 16 × 16 one-bit masks. Use the live sprite reader, preserve frame order, and select direction explicitly. Draw square pixels at integer scale and integer screen placement. Native stills use 5× pixels, an 80 × 80 box, and an anchor at horizontal center / row 15.

Preserve the original black mask and a white one-pixel halo, clipped to the 16 × 16 box. Never rotate, skew, stretch, merge, smooth, recolor, or generate replacement character pixels. Genesis 8 × 8 portraits are a separate collection, not substitute walking bodies. Colossus has no up/down frames; use the SDK's explicit horizontal fallback.

## Loading and unfinished worlds

Use the existing 48 × 48 construction grid. Loading variants remove additional chunks from the complete silhouette. Courtyard holes and gaps between islands remain real architecture in both variants.

- `void`: remove the surface, revealing negative space and the black underside.
- `wireframe`: remove the surface and show an open guide without a filled tile; green by default, lilac in color mode.
- `floating`: remove the socket and suspend a separate dither tile above it; white by default, sun in color mode. `lift` is in native screen pixels.

Paths and textures disappear inside every missing chunk. Omit props, signals, and actor anchors above missing ground. Clip boundary sockets to the intended silhouette; do not accidentally create extra exterior platforms.

## New assets and review

Start from an existing preset and give a new world a distinct silhouette, setting, and landmarks. Extend vector prop artwork in the renderer; keep a single source for both scene and standalone exports. Record each prop's ground anchor and collision footprint. Do not insert raw SVG supplied by players into the page.

Export editable JSON, a transparent SVG, and a still for visual review. Inspect on both light and dark backgrounds, including edges, clipping, front/back occlusion, loading gaps, pixel scale, and every newly drawn prop. If adding a new prop type, export it independently with its anchor so other creators can reuse it.
