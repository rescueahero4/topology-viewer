# Designing custom nodes

Quollio Topology draws QDIC classes with their own icons. For every other node type, design the
node yourself in `types` instead of relying on predetermined assets. Declare each type once:

    "types": {
      "<node type>": { "label": "Supplier", "rank": 1, "color": "#5b6b8c", "abbr": "SU", "glyph": "<svg path d>" }
    }

## 1. Geometry follows hierarchy
Infer the hierarchy in the data first, then give each type a rank. The number of sides grows with
the rank:

| rank | shape            | use for                                            |
|------|------------------|----------------------------------------------------|
| 0    | circle           | the smallest unit of a data point (a leaf, a record) |
| 1    | triangle         | one level up: a thing that groups or produces units |
| 2    | square / diamond | containers; pick diamond for a sibling class at the same level |
| 3    | pentagon         | systems or domains of containers                   |
| 4–6  | hexagon → octagon | the top of the hierarchy                          |

If there is no hierarchy, use rank 0 (circle) for every type. Never use a shape to mean
anything other than level.

## 2. Sizing comes from rank
Size is not free: rank 0 is 20px and each rank adds 6px, up to 56px at rank 6. Higher in the
hierarchy reads bigger. Don't send a size.

## 3. Glyph, else two letters
If the type has an obvious pictogram, send it as `glyph`: one SVG path `d` in a 24×24 box,
stroke-only (like Lucide icons). If not, send `abbr`: two roman letters that read as the type
(SUpplier → SU, KPI → KP). Every type in one payload needs different letters.

## 4. Colour is free-range, contrast is not
Any hue is fine. Avoid highly saturated colours: the renderer caps saturation at 55%.
Nodes must stand out from the light canvas (#F4F4F5) and from the edges, which are mid-tone
colours. Choose medium-dark tones: the renderer darkens anything below 3:1 contrast
with the canvas, and puts white or ink text on the node, whichever reads better.
Give related types related hues, and unrelated types distinct ones.