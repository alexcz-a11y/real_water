import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Object3D,
  Vector2,
  Vector3,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  attribute,
  color,
  float,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  vec3,
} from "three/tsl";

/**
 * Reference basalt sea stack — a code-only procedural reconstruction of the approved
 * Reference Pack `docs/reference-packs/basalt-sea-stack-v001.md`.
 *
 * The stack exists so the Reference Experience gains a distant reflection, shadow, fog and
 * horizon-composition target. It is a silhouette and a reflection subject, not a part-level
 * reconstruction, and it simulates no shoreline.
 *
 * The single identity feature is the WATERLINE: a level, unbroken, hard boundary with distinctly
 * darker rock below it. `docs/reference-bible.md` §10 makes it the edge the water reflection reads
 * from, so it is guaranteed level twice over — the geometry is cut at exactly y = 0, and the
 * shading boundary is a function of world Y alone.
 *
 * Every number here is carried from `docs/reconstructions/basalt-sea-stack-v001.sculpt.json`;
 * `reference-basalt-sea-stack.test.ts` fails if the two ever disagree.
 */

/** Model-space contract, mirrored from the sculpt spec's `proceduralField`. */
export const BASALT_SEA_STACK_FIELD = Object.freeze({
  /** Deterministic. Lives in the spec, never generated, so every build is identical. */
  seed: 28049,
  /** Metres. Anchor: above-water height / max diameter = 1.026; Bible §4 gives 250–300 m. */
  aboveWaterHeightMetres: 275,
  maxRadiusMetres: 134,
  /** Bible §10 fixes the character, not the depth; 0.307 × above-water, from the anchor. */
  submergedDepthMetres: 84,
  /**
   * 5.6 % of the diameter. The direct joint count on three admitted views spans 4.0-6.7 % with a
   * median of 5.0 %; re-measuring the anchor and the render through the same scale-aware detector
   * at matched resolution put the reference at 5.68 % and a 13.4 m field at 4.98 %.
   */
  meanColumnWidthMetres: 15.0,
  latticeJitter: 0.34,
  courseStepRaggednessProbability: 0.45,
  /**
   * Height fraction below which the stack is a straight, un-terraced drum. The measured envelope
   * moves from r/R 0.986 to 0.988 over this band — it has no course structure, so whole-course
   * raggedness must not be applied to it. Applying it there twice turned the drum the anchor
   * clearly has into a stub and the mass read as a dome.
   */
  drumTopFraction: 0.222,
  courseCount: 9,
  topJitterColumnWidths: 1.0,
  spireFraction: 0.04,
  /**
   * Fraction of columns that broke off below the envelope, and how far down they stopped.
   *
   * Kept small. At 0.30 over 0.35-0.88 it ate the straight lower drum the anchor clearly has —
   * the outer ring defines the lower silhouette, so shortening a third of it collapsed the
   * shoulders and the mass read as a dome on a stub. The mosaic of exposed tops belongs INSIDE
   * each terrace (courseStepRaggednessProbability), not in wholesale shortening.
   */
  brokenColumnFraction: 0.06,
  brokenColumnRange: Object.freeze([0.55, 0.9] as const),
  spireBonusCourses: Object.freeze([0.12, 0.35] as const),
  topFaceCantDegrees: Object.freeze([0, 7] as const),
  topFaceDomeFraction: 0.02,
  arrisChamferFractionOfWidth: 0.06,
  /**
   * Width of the VERTICAL arris chamfer, as a fraction of a column's width. Separate from the top
   * rim's chamfer and much wider: at 0.06 the corner facet is about a metre on a 15 m column, which
   * is a pixel at the distance this asset is seen from and read as nothing at all. The reference's
   * dark joint lines are 5-8 % of a column's width.
   */
  verticalArrisFractionOfWidth: 0.09,
  jointGrooveInsetFractionOfWidth: 0.03,
  /**
   * Floor on the half-gap, in metres. The inset is a fraction of each column's OWN width, and the
   * field's widths span 0.62-1.58× the mean, so the narrowest cells ended up with a joint gap
   * under a metre. That is below `self_intersection.py`'s own probe epsilon, which made a packed
   * field indistinguishable from an intersecting one on exactly those cells.
   */
  minJointHalfGapMetres: 0.6,
  /** (u, r/maxRadius) — u is height above the waterline / aboveWaterHeightMetres. */
  envelopeProfile: Object.freeze<readonly (readonly [number, number])[]>([
    [0.0, 0.986],
    [0.09, 1.0],
    [0.15, 0.992],
    [0.22, 0.988],
    [0.28, 0.964],
    [0.35, 0.967],
    [0.41, 0.942],
    [0.48, 0.898],
    [0.54, 0.897],
    [0.61, 0.808],
    [0.67, 0.777],
    [0.74, 0.747],
    [0.79, 0.701],
    [0.83, 0.653],
    [0.87, 0.65],
    [0.9, 0.639],
    [0.92, 0.595],
    [0.95, 0.578],
    [0.97, 0.54],
    [1.0, 0.3],
  ]),
  /**
   * Height courses, as fractions of the above-water height, that bound each named zone.
   * A column belongs to the zone its own top falls in, so no column is ever cut in two.
   */
  zoneBounds: Object.freeze({
    "lower-rampart": [0.0, 0.222],
    "mid-terraces": [0.222, 0.556],
    "upper-terraces": [0.556, 0.889],
    "summit-cluster": [0.889, 1.2],
  } as const),
} as const);

/**
 * Vertex-colour regions. These are the exact palette `vertex_region_gate.py` classifies against,
 * so per-column tone variation deliberately does NOT live here — it rides on the `cellSeed`
 * attribute instead, where it cannot blur a region boundary the gate has to measure.
 */
export const BASALT_SEA_STACK_PALETTE = Object.freeze({
  /** De-lit dominant from `crop-mat-dry-face`, extraction confidence 0.86. */
  "basalt-dry": "#615d5c",
  /** Dry albedo × the measured lit ratio (49,40,30)/(116,107,99). */
  "basalt-wet": "#29231c",
  /** Dry albedo × the measured tops/faces ratio 128/92, shifted cool. */
  "basalt-upface": "#868488",
} as const);

export type BasaltSeaStackOptions = {
  /**
   * How far the dark stain rises ABOVE the water plane, in metres. Defaults to 0 because that is
   * exactly what the reference measures: every approved view crops or fades before the band's
   * lower edge, so only its TOP edge is evidence. A reviewer settles the rest visually.
   */
  readonly stainRiseMetres?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
};

export type BasaltSeaStackRuntime = {
  readonly nodes: Record<string, Object3D>;
  readonly meshes: Record<string, Mesh>;
  readonly sockets: Record<string, Object3D>;
  readonly colliders: Record<string, unknown>;
  readonly destructionGroups: Record<string, Object3D[]>;
};

const ZONE_IDS = [
  "lower-rampart",
  "mid-terraces",
  "upper-terraces",
  "summit-cluster",
] as const;
type ZoneId = (typeof ZONE_IDS)[number];

/** Courses per zone, in bottom-to-top order; nine above water plus the submerged shaft. */
const COURSE_ZONES: Record<string, ZoneId> = {
  "course-1": "lower-rampart",
  "course-2": "lower-rampart",
  "course-3": "mid-terraces",
  "course-4": "mid-terraces",
  "course-5": "mid-terraces",
  "course-6": "upper-terraces",
  "course-7": "upper-terraces",
  "course-8": "upper-terraces",
  "course-9": "summit-cluster",
};

/**
 * Indexed read that states its own contract. `noUncheckedIndexedAccess` is on for good reason;
 * silencing it with `!` at every polygon walk would hide a real off-by-one behind punctuation.
 */
function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new RangeError(
      `index ${index} is outside a ${items.length}-item list`,
    );
  }
  return value;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radius of the revolved envelope at height fraction `u` above the waterline. */
export function envelopeRadius(u: number): number {
  const profile = BASALT_SEA_STACK_FIELD.envelopeProfile;
  const max = BASALT_SEA_STACK_FIELD.maxRadiusMetres;
  const first = at(profile, 0);
  const last = at(profile, profile.length - 1);
  if (u <= first[0]) return first[1] * max;
  if (u >= last[0]) return last[1] * max;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const [ua, ra] = at(profile, index);
    const [ub, rb] = at(profile, index + 1);
    if (u >= ua && u <= ub) {
      const t = (u - ua) / (ub - ua);
      return (ra + (rb - ra) * t) * max;
    }
  }
  return last[1] * max;
}

/**
 * The highest `u` whose envelope still contains a column standing at plan radius `radius`.
 * This is the inverse of `envelopeRadius`, and it is what turns one measured outline into a
 * per-column height — a column exists from the bottom up to where the mass narrows past it.
 */
export function columnTopFraction(radius: number): number {
  const steps = 240;
  let highest = 0;
  for (let index = 0; index <= steps; index += 1) {
    const u = index / steps;
    if (envelopeRadius(u) >= radius) highest = u;
  }
  return highest;
}

type Column = {
  readonly polygon: Vector2[];
  readonly centre: Vector2;
  readonly width: number;
  readonly topY: number;
  readonly cantX: number;
  readonly cantZ: number;
  readonly dome: number;
  readonly cellSeed: number;
  readonly course: string;
};

/** Clip `polygon` to the half-plane nearer to `site` than to `other` (a Voronoi bisector). */
function clipToBisector(
  polygon: Vector2[],
  site: Vector2,
  other: Vector2,
): Vector2[] {
  const normal = new Vector2().subVectors(other, site);
  const length = normal.length();
  if (length < 1e-9) return polygon;
  normal.divideScalar(length);
  const offset = normal.dot(
    new Vector2().addVectors(site, other).multiplyScalar(0.5),
  );
  const out: Vector2[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = at(polygon, index);
    const next = at(polygon, (index + 1) % polygon.length);
    const dCurrent = normal.dot(current) - offset;
    const dNext = normal.dot(next) - offset;
    if (dCurrent <= 0) out.push(current);
    if (dCurrent * dNext < 0) {
      const t = dCurrent / (dCurrent - dNext);
      out.push(new Vector2().lerpVectors(current, next, t));
    }
  }
  return out;
}

/**
 * Signed area of a plan polygon in (x, z). Positive is counter-clockwise in that plane.
 *
 * The column walls are emitted as (a_low, b_low, b_high, a_high) following the polygon's order, and
 * that produces an OUTWARD normal only when the polygon runs clockwise in (x, z). The Voronoi
 * clipper's seed square runs counter-clockwise, so every prism came out wound inside-out: signed
 * volume negative on all ten meshes, explicit normals pointing into the solid, and — the part that
 * would have been silently wrong rather than merely invisible — `normalWorld.y` inverted, which is
 * the input the bleached-top material layer keys on.
 */
function planSignedArea(polygon: Vector2[]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = at(polygon, index);
    const b = at(polygon, (index + 1) % polygon.length);
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * True inward offset of a convex polygon: every EDGE moves `amount` along its own normal and the
 * offset lines are re-intersected.
 *
 * Pulling each vertex radially toward the centroid instead — which is what this did first — is not
 * a polygon offset. A vertex moved radially by d retreats its two edges by only d·cos θ, and for an
 * elongated Voronoi cell θ approaches 90°, so neighbouring columns kept touching however large the
 * groove was set, and `self_intersection.py` read those contacts as vertices sitting inside their
 * own mesh.
 */
function insetPolygon(
  polygon: Vector2[],
  centre: Vector2,
  amount: number,
): Vector2[] {
  const count = polygon.length;
  if (count < 3 || amount <= 0) return polygon.map((point) => point.clone());
  const normals: Vector2[] = [];
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const a = at(polygon, index);
    const b = at(polygon, (index + 1) % count);
    const edge = new Vector2().subVectors(b, a);
    if (edge.lengthSq() < 1e-12) continue;
    // Inward normal: whichever of the two candidates points toward the centroid.
    const normal = new Vector2(-edge.y, edge.x).normalize();
    if (normal.dot(new Vector2().subVectors(centre, a)) < 0) normal.negate();
    normals.push(normal);
    offsets.push(normal.dot(a) + amount);
  }
  if (normals.length < 3) return polygon.map((point) => point.clone());
  const out: Vector2[] = [];
  for (let index = 0; index < normals.length; index += 1) {
    const n0 = at(normals, index);
    const n1 = at(normals, (index + 1) % normals.length);
    const d0 = at(offsets, index);
    const d1 = at(offsets, (index + 1) % offsets.length);
    const determinant = n0.x * n1.y - n0.y * n1.x;
    if (Math.abs(determinant) < 1e-9) {
      return polygon.map((point) => point.clone());
    }
    const x = (d0 * n1.y - d1 * n0.y) / determinant;
    const y = (n0.x * d1 - n1.x * d0) / determinant;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return scaleAboutCentre(polygon, centre, amount);
    }
    out.push(new Vector2(x, y));
  }
  // A cell narrower than twice the offset turns inside out rather than vanishing: the offset lines
  // still intersect, just on the far side, and the result is a bow tie. That is a genuine
  // self-intersection, and it is what `self_intersection.py` was finding on 246 of 266 above-water
  // columns — the sliver cells at the lattice edge, inset twice for the joint and then the arris.
  // Detect it by orientation and area rather than trusting the intersection to fail.
  const before = planSignedArea(polygon);
  const after = planSignedArea(out);
  if (
    Math.sign(after) !== Math.sign(before) ||
    Math.abs(after) < Math.abs(before) * 0.25
  ) {
    return scaleAboutCentre(polygon, centre, amount);
  }
  return out;
}

/** Fallback shrink for a cell too thin to offset: uniform scale about the centroid, never inverted. */
function scaleAboutCentre(
  polygon: Vector2[],
  centre: Vector2,
  amount: number,
): Vector2[] {
  let radius = 0;
  for (const point of polygon)
    radius = Math.max(radius, point.distanceTo(centre));
  const factor = radius > 0 ? Math.max(0.35, (radius - amount) / radius) : 1;
  return polygon.map((point) =>
    new Vector2().subVectors(point, centre).multiplyScalar(factor).add(centre),
  );
}

/**
 * Build the seeded column field.
 *
 * Sites sit on a jittered hexagonal lattice and each column is that site's true Voronoi cell,
 * so the cells tile the plan with no gaps and come out as irregular 4-to-7-gons at the measured
 * 1:2 width spread. The outer cells are deliberately NOT clipped to a circle: letting them
 * protrude is what scallops the silhouette, which is the one columnar signal that survives to
 * the distance this asset is actually seen from.
 */
export function buildColumnField(): Column[] {
  const field = BASALT_SEA_STACK_FIELD;
  const random = mulberry32(field.seed);
  const pitch = field.meanColumnWidthMetres;
  const siteRadius = field.maxRadiusMetres - pitch * 0.35;
  const rowStep = (pitch * Math.sqrt(3)) / 2;
  const rows = Math.ceil((siteRadius + pitch * 2) / rowStep);

  const sites: Vector2[] = [];
  const interior: boolean[] = [];
  for (let row = -rows; row <= rows; row += 1) {
    const z = row * rowStep;
    const offset = (row & 1) === 0 ? 0 : pitch / 2;
    const columns = Math.ceil((siteRadius + pitch * 2) / pitch);
    for (let column = -columns; column <= columns; column += 1) {
      const x = column * pitch + offset;
      const site = new Vector2(x, z);
      // A margin ring of sites bounds the outermost real cells; without it their bisector
      // clipping is one-sided and they blow out into slabs.
      if (site.length() > siteRadius + pitch * 1.6) continue;
      const angle = random() * Math.PI * 2;
      const distance = random() * field.latticeJitter * pitch;
      site.x += Math.cos(angle) * distance;
      site.y += Math.sin(angle) * distance;
      sites.push(site);
      interior.push(site.length() <= siteRadius);
    }
  }

  const columns: Column[] = [];
  const courseStep = 1 / field.courseCount;
  let maxExtent = 0;

  for (let index = 0; index < sites.length; index += 1) {
    if (at(interior, index) !== true) continue;
    const site = at(sites, index);
    const span = pitch * 1.6;
    let polygon: Vector2[] = [
      new Vector2(site.x - span, site.y - span),
      new Vector2(site.x + span, site.y - span),
      new Vector2(site.x + span, site.y + span),
      new Vector2(site.x - span, site.y + span),
    ];
    const neighbours = sites
      .map((other, otherIndex) => ({
        other,
        distance: other.distanceTo(site),
        otherIndex,
      }))
      .filter(
        (entry) => entry.otherIndex !== index && entry.distance < pitch * 3,
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 16);
    for (const neighbour of neighbours) {
      polygon = clipToBisector(polygon, site, neighbour.other);
      if (polygon.length < 3) break;
    }
    if (polygon.length < 3) continue;
    if (planSignedArea(polygon) > 0) polygon.reverse();

    const centre = polygon
      .reduce((sum, point) => sum.add(point), new Vector2())
      .divideScalar(polygon.length);
    let width = 0;
    for (const point of polygon)
      width = Math.max(width, point.distanceTo(centre) * 2);
    for (const point of polygon)
      maxExtent = Math.max(maxExtent, point.length());

    columns.push({
      polygon,
      centre,
      width,
      topY: 0,
      cantX: 0,
      cantZ: 0,
      dome: 0,
      cellSeed: 0,
      course: "course-1",
    });
  }

  // Normalise the field so its TYPICAL outer radius is the measured maximum radius — the median
  // over azimuth, not the single widest vertex.
  //
  // Normalising the maximum put one protruding column on 134 m and left the rest inside it, so the
  // width the camera actually sees at any given azimuth came out about 4 % short and the rendered
  // aspect ratio missed the reference by more than the gate's 5 % tolerance. The reference's own
  // measured width is a typical silhouette width, so the statistic has to match: median out, not
  // max out.
  const BINS = 180;
  const azimuthMax = new Array<number>(BINS).fill(0);
  for (const column of columns) {
    for (const point of column.polygon) {
      const bin = Math.floor(
        ((Math.atan2(point.y, point.x) + Math.PI * 2) % (Math.PI * 2)) /
          ((Math.PI * 2) / BINS),
      );
      const index = Math.min(BINS - 1, Math.max(0, bin));
      azimuthMax[index] = Math.max(at(azimuthMax, index), point.length());
    }
  }
  const occupied = azimuthMax
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const medianOuter =
    occupied.length > 0
      ? at(occupied, Math.floor(occupied.length / 2))
      : maxExtent;
  // Normalise the outline the camera SEES, not the polygon before it is inset. Each column is
  // pulled back by the joint groove and then by the vertical arris, so scaling the raw Voronoi
  // outline to 134 m leaves the rendered silhouette about half a percent short — enough to drop
  // Tier 1's IoU from 0.851 to 0.8496 against a 0.85 threshold once the arris was widened.
  const typicalGroove = Math.max(
    field.meanColumnWidthMetres * field.jointGrooveInsetFractionOfWidth,
    field.minJointHalfGapMetres,
  );
  const scale = (field.maxRadiusMetres + typicalGroove) / medianOuter;
  const heights = mulberry32(field.seed ^ 0x9e3779b9);

  const shaped = columns.map((column) => {
    const polygon = column.polygon.map((point) =>
      point.clone().multiplyScalar(scale),
    );
    const centre = column.centre.clone().multiplyScalar(scale);
    const width = column.width * scale;
    const radiusFraction = centre.length();

    // Raggedness in WHOLE COURSES, not in radius.
    //
    // The first attempt jittered the radius each column read its height from, by ±10 %. That is
    // about one cell at the rim, so it moved columns between courses at random and the terraces
    // dissolved into a bristle field — the outer ring's tops scattered over a 25 %-of-height band
    // instead of forming the lowest shelf. Stepping a minority of columns a whole course up or
    // down keeps the shelves intact and still breaks their edges, which is what the anchor shows:
    // broad terraces with ragged rims, not a smooth dome of spikes.
    const raw = columnTopFraction(radiusFraction);
    let courseLevel = Math.round(raw / courseStep);
    const ragged = heights();
    if (raw > field.drumTopFraction) {
      if (ragged < field.courseStepRaggednessProbability / 2) courseLevel += 1;
      else if (ragged < field.courseStepRaggednessProbability) courseLevel -= 1;
    }
    let u = Math.max(0, courseLevel) * courseStep;
    u +=
      ((heights() - 0.5) * 2 * field.topJitterColumnWidths * width) /
      field.aboveWaterHeightMetres;
    if (heights() < field.brokenColumnFraction) {
      const low = field.brokenColumnRange[0];
      const high = field.brokenColumnRange[1];
      u *= low + heights() * (high - low);
    } else if (heights() < field.spireFraction) {
      const low = field.spireBonusCourses[0];
      const high = field.spireBonusCourses[1];
      u += (low + heights() * (high - low)) * courseStep;
    }
    u = Math.max(courseStep * 0.35, u);

    const cant = (field.topFaceCantDegrees[1] * Math.PI) / 180;
    const zoneEntries = Object.entries(BASALT_SEA_STACK_FIELD.zoneBounds) as [
      ZoneId,
      readonly [number, number],
    ][];
    const zone =
      zoneEntries.find(([, bounds]) => u >= bounds[0] && u < bounds[1])?.[0] ??
      "summit-cluster";
    const courseIndex = Math.min(
      field.courseCount,
      Math.max(1, Math.ceil(u / courseStep)),
    );
    const preferred = `course-${courseIndex}`;
    const course =
      COURSE_ZONES[preferred] === zone
        ? preferred
        : (Object.keys(COURSE_ZONES).find((id) => COURSE_ZONES[id] === zone) ??
          "course-1");

    return {
      polygon,
      centre,
      width,
      topY: u * field.aboveWaterHeightMetres,
      cantX: Math.tan((heights() - 0.5) * 2 * cant),
      cantZ: Math.tan((heights() - 0.5) * 2 * cant),
      dome: width * field.topFaceDomeFraction,
      cellSeed: heights(),
      course,
    };
  });

  // Bible §4 fixes the stack at 250-300 m, and a stack's height is the height of its highest
  // point — not of the envelope the tops scatter around. Top jitter and spires carry the tallest
  // column about 10 % past u = 1, so the field is normalised to land its own summit exactly on
  // `aboveWaterHeightMetres`. Skipping this rendered the measured above-water H/D of 1.026 as
  // 1.13, which reads as a model 11 % too tall against the anchor the pack makes authoritative.
  // Normalise on the tallest column.
  //
  // The 97th percentile was tried instead, to stop one needle defining the summit: the anchor's
  // top row is 0.21 of maximum width and the model's was 0.05. It did not fix the summit (0.038)
  // and it cost the measurement that matters more — total H/W drifted from 1.315 to 1.404 against
  // the anchor's 1.327, because scaling up on a percentile pushes the real maximum past the
  // Bible's height. Reverted. The narrow summit is recorded as a remaining difference rather than
  // bought at the price of the authoritative proportion.
  let summit = 0;
  for (const column of shaped) summit = Math.max(summit, column.topY);
  const heightScale = summit > 0 ? field.aboveWaterHeightMetres / summit : 1;
  return shaped.map((column) => ({
    ...column,
    topY: column.topY * heightScale,
    dome: column.dome * heightScale,
  }));
}

type Buffers = {
  position: number[];
  normal: number[];
  colorAttr: number[];
  cellSeed: number[];
  wetness: number[];
  /** 1 on a corner-chamfer face, 0 on a column's main face. Drives the joint's cavity darkening. */
  arrisness: number[];
};

function emptyBuffers(): Buffers {
  return {
    position: [],
    normal: [],
    colorAttr: [],
    cellSeed: [],
    wetness: [],
    arrisness: [],
  };
}

function pushTriangle(
  buffers: Buffers,
  a: Vector3,
  b: Vector3,
  c: Vector3,
  tint: Color,
  cellSeed: number,
  wetness: number,
  arrisness = 0,
): void {
  const normal = new Vector3()
    .subVectors(b, a)
    .cross(new Vector3().subVectors(c, a))
    .normalize();
  for (const point of [a, b, c]) {
    buffers.position.push(point.x, point.y, point.z);
    buffers.normal.push(normal.x, normal.y, normal.z);
    buffers.colorAttr.push(tint.r, tint.g, tint.b);
    buffers.cellSeed.push(cellSeed);
    buffers.wetness.push(wetness);
    buffers.arrisness.push(arrisness);
  }
}

function toGeometry(buffers: Buffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(buffers.position), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(buffers.normal), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(buffers.colorAttr), 3),
  );
  geometry.setAttribute(
    "cellSeed",
    new BufferAttribute(new Float32Array(buffers.cellSeed), 1),
  );
  geometry.setAttribute(
    "wetness",
    new BufferAttribute(new Float32Array(buffers.wetness), 1),
  );
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Emit one column's walls, chamfered top rim and broken top into `buffers`.
 *
 * `yFrom`/`yTo` clamp the emitted span, which is how the waterline cut is made: the submerged
 * shaft asks for (-depth, 0) and every above-water course asks for (0, top). The two meshes meet
 * on the plane y = 0 with duplicated vertices, so the wet/dry boundary is a mesh boundary and is
 * level by construction rather than by shading luck.
 */
function emitColumn(
  buffers: Buffers,
  column: Column,
  yFrom: number,
  yTo: number,
  capTop: "broken" | "flat",
  capBottom: boolean,
): void {
  const capped = capTop === "broken";
  const field = BASALT_SEA_STACK_FIELD;
  const dry = new Color(BASALT_SEA_STACK_PALETTE["basalt-dry"]);
  const wet = new Color(BASALT_SEA_STACK_PALETTE["basalt-wet"]);
  const upface = new Color(BASALT_SEA_STACK_PALETTE["basalt-upface"]);

  const groove = Math.max(
    column.width * field.jointGrooveInsetFractionOfWidth,
    field.minJointHalfGapMetres,
  );
  const chamfer = column.width * field.arrisChamferFractionOfWidth;
  const outer = insetPolygon(column.polygon, column.centre, groove);

  // Cant applies to a BROKEN top only. The submerged shaft's lid is the waterline cut, and a
  // canted cut plane is not a cut plane: with the cant left in, the shaft's highest vertex sat
  // 1.5 m ABOVE y=0, so the "mesh boundary at the waterline" was not one. The vertex-region gate
  // did not catch it because the colour is assigned from the same yTo and stayed consistent —
  // a colour-region check and a geometry check are not substitutes for each other.
  const capHeight = (point: Vector2): number =>
    capped
      ? yTo +
        (point.x - column.centre.x) * column.cantX +
        (point.y - column.centre.y) * column.cantZ
      : yTo;

  // The wall top follows the cant instead of sitting on one flat plane. With a flat top the cap's
  // low side could tilt BELOW it — the cant drop reaches 0.92 m against a 0.90 m chamfer — so the
  // chamfer ring folded through the wall and the prism genuinely self-intersected.
  const wallTopAt = (point: Vector2): number =>
    capped ? capHeight(point) - chamfer : capHeight(point);

  const wallTint = (y: number): Color => (y < 0 ? wet : dry);
  const wallWet = (y: number): number => (y < 0 ? 1 : 0);

  // Vertical arris chamfer. `column-field.arrisRound` specifies that EVERY vertical edge is
  // rounded, and it was built on the top rim only: the walls met at a hard corner, so a joint read
  // as an open slot between two flat slabs instead of as the dark line the reference shows. Each
  // wall face is pulled back along its own edge by the arris, and a short chamfer face bridges the
  // gap at every corner — two catching edges per joint, which is what makes it read.
  const arris = column.width * field.verticalArrisFractionOfWidth;
  const trimmed: [Vector2, Vector2][] = [];
  for (let index = 0; index < outer.length; index += 1) {
    const a = at(outer, index);
    const b = at(outer, (index + 1) % outer.length);
    const along = new Vector2().subVectors(b, a);
    const span = along.length();
    if (span < 1e-6) {
      trimmed.push([a.clone(), b.clone()]);
      continue;
    }
    const step = Math.min(arris, span * 0.35);
    along.multiplyScalar(step / span);
    trimmed.push([
      new Vector2().addVectors(a, along),
      new Vector2().subVectors(b, along),
    ]);
  }

  const faces: [Vector2, Vector2, number][] = [];
  const outline: Vector2[] = [];
  for (let index = 0; index < trimmed.length; index += 1) {
    const [start, end] = at(trimmed, index);
    faces.push([start, end, 0]);
    // Corner chamfer: from this edge's end to the next edge's start.
    const [nextStart] = at(trimmed, (index + 1) % trimmed.length);
    faces.push([end, nextStart, 1]);
    outline.push(start, end);
  }
  // The top rim must sit on the chamfered outline, not on the original polygon, or the rim ring
  // and the wall top no longer share an edge and the column opens at every corner.
  const capRing = insetPolygon(outline, column.centre, chamfer);

  for (let index = 0; index < faces.length; index += 1) {
    const [a, b, corner] = at(faces, index);
    const low0 = new Vector3(a.x, yFrom, a.y);
    const low1 = new Vector3(b.x, yFrom, b.y);
    const high0 = new Vector3(a.x, wallTopAt(a), a.y);
    const high1 = new Vector3(b.x, wallTopAt(b), b.y);
    // Split the wall quad at y = 0 when it straddles the waterline so the colour region boundary
    // lands on real vertices instead of being interpolated across a tall quad.
    const straddles = yFrom < 0 && Math.min(wallTopAt(a), wallTopAt(b)) > 0;
    const segments: [Vector3, Vector3, Vector3, Vector3][] = straddles
      ? [
          [low0, low1, new Vector3(b.x, 0, b.y), new Vector3(a.x, 0, a.y)],
          [new Vector3(a.x, 0, a.y), new Vector3(b.x, 0, b.y), high1, high0],
        ]
      : [[low0, low1, high1, high0]];
    for (const [p0, p1, p2, p3] of segments) {
      const tint = wallTint((p0.y + p3.y) / 2);
      const wetValue = wallWet((p0.y + p3.y) / 2);
      pushTriangle(
        buffers,
        p0,
        p1,
        p2,
        tint,
        column.cellSeed,
        wetValue,
        corner,
      );
      pushTriangle(
        buffers,
        p0,
        p2,
        p3,
        tint,
        column.cellSeed,
        wetValue,
        corner,
      );
    }
  }

  if (capped) {
    const capTint = yTo < 0 ? wet : upface;
    const capWet = yTo < 0 ? 1 : 0;
    for (let index = 0; index < outline.length; index += 1) {
      const a = at(outline, index);
      const b = at(outline, (index + 1) % outline.length);
      const ai = at(capRing, index);
      const bi = at(capRing, (index + 1) % capRing.length);
      const p0 = new Vector3(a.x, wallTopAt(a), a.y);
      const p1 = new Vector3(b.x, wallTopAt(b), b.y);
      const p2 = new Vector3(bi.x, capHeight(bi), bi.y);
      const p3 = new Vector3(ai.x, capHeight(ai), ai.y);
      pushTriangle(buffers, p0, p1, p2, capTint, column.cellSeed, capWet);
      pushTriangle(buffers, p0, p2, p3, capTint, column.cellSeed, capWet);
    }
    const apex = new Vector3(
      column.centre.x,
      capHeight(column.centre) + column.dome,
      column.centre.y,
    );
    for (let index = 0; index < capRing.length; index += 1) {
      const a = at(capRing, index);
      const b = at(capRing, (index + 1) % capRing.length);
      pushTriangle(
        buffers,
        new Vector3(a.x, capHeight(a), a.y),
        new Vector3(b.x, capHeight(b), b.y),
        apex,
        capTint,
        column.cellSeed,
        capWet,
      );
    }
  }

  if (capTop === "flat") {
    // Flat lid at the cut plane, not a broken top: this is an interior face that closes the
    // submerged segment so ray parity has a surface to count. It faces up, the course segment's
    // bottom lid above it faces down, so backface culling hides both from outside.
    const centre = new Vector3(column.centre.x, yTo, column.centre.y);
    for (let index = 0; index < outline.length; index += 1) {
      const a = at(outline, index);
      const b = at(outline, (index + 1) % outline.length);
      pushTriangle(
        buffers,
        new Vector3(a.x, yTo, a.y),
        new Vector3(b.x, yTo, b.y),
        centre,
        yTo < 0 ? wet : dry,
        column.cellSeed,
        yTo < 0 ? 1 : 0,
      );
    }
  }

  if (capBottom) {
    const centre = new Vector3(column.centre.x, yFrom, column.centre.y);
    const tint = yFrom < 0 ? wet : dry;
    const wetValue = yFrom < 0 ? 1 : 0;
    for (let index = 0; index < outline.length; index += 1) {
      const a = at(outline, index);
      const b = at(outline, (index + 1) % outline.length);
      pushTriangle(
        buffers,
        new Vector3(b.x, yFrom, b.y),
        new Vector3(a.x, yFrom, a.y),
        centre,
        tint,
        column.cellSeed,
        wetValue,
      );
    }
  }
}

/**
 * One `MeshStandardNodeMaterial` shaded entirely in TSL (ADR-0005). No texture is loaded or
 * emitted: albedo, roughness and cavity response are independent nodes over the vertex colour,
 * the per-cell seed and world position, so none of them is a copy of another.
 */
function createBasaltMaterial(
  options: Required<Pick<BasaltSeaStackOptions, "stainRiseMetres">>,
) {
  const material = new MeshStandardNodeMaterial();
  material.flatShading = true;
  material.metalness = 0;

  const regionColor = attribute<"vec3">("color", "vec3");
  const cellSeed = attribute<"float">("cellSeed", "float");

  // Per-column tone. Kept OFF the vertex colour on purpose: `vertex_region_gate.py` classifies
  // vertices against the exact palette, and a ±30 % tone spread baked into `color` would read as
  // an unclassified fringe rather than as the variation it is.
  const tone = cellSeed.mul(0.3).add(0.85);

  // Crazed light mineral veining — detail `basalt-dry.veinCrazing`.
  //
  // Cell size is set from the measurement, not by eye: the detail inventory puts the crazing at
  // 3-8 % of a column's width, which is 0.5-1.2 m on a 15 m column. A first attempt used two
  // octaves at 0.55 and 1.7 rad/m, i.e. features about 11 m across, and rendered as a regular
  // ornamental lattice — periodic because a product of sines is periodic, and twenty times too
  // coarse. The frequencies below sit in the measured band and are mutually incommensurate, and
  // each octave uses a different axis triple so the products do not line up into a visible grid.
  const veinField = (scale: number, phase: number) => {
    const p = positionWorld.mul(scale);
    const a = p.x.add(p.z.mul(0.7)).add(phase).sin();
    const b = p.z.sub(p.y.mul(1.3)).mul(1.19).cos();
    const c = p.y.add(p.x.mul(0.41)).mul(0.83).sin();
    return a.mul(b).add(c.mul(0.6)).abs().oneMinus().pow(8);
  };
  const veins = veinField(5.9, 0).mul(0.6).add(veinField(13.7, 2.1).mul(0.4));

  // Meso band — face-scale value breakup, the spec's surfaceFrequencyBands.meso.
  //
  // The reference's column faces are not flat between their joints: each carries broad light and
  // dark blotches a few metres across, and without them the render read as flat panels with a dark
  // line down each side. Frequencies are chosen for features of 2.5-7 m, which is a fraction of a
  // 15 m face, and are mutually incommensurate so the three bands do not beat into a pattern.
  const mesoField = positionWorld
    .mul(0.31)
    .x.add(positionWorld.mul(0.23).y)
    .sin()
    .mul(positionWorld.mul(0.19).z.add(positionWorld.mul(0.27).x).cos())
    .add(
      positionWorld.mul(0.13).z.sub(positionWorld.mul(0.17).y).sin().mul(0.7),
    );
  const meso = mesoField.mul(0.5).add(0.5);

  // Shallow spall scars — detail `basalt-dry.spallScar`. Below the resolvable scale at this
  // asset's distance, so they ride the roughness channel only, never the silhouette.
  const spall = positionWorld
    .mul(0.09)
    .x.sin()
    .mul(positionWorld.mul(0.11).z.cos())
    .mul(0.5)
    .add(0.5);

  // Wet stain. A function of world Y alone, so the boundary stays a level plane at any azimuth
  // and under any transform of the parent — it cannot follow the column steps the way the
  // reference's own diffuse shading does.
  const stainTop = float(options.stainRiseMetres);
  const wetness = smoothstep(
    stainTop,
    stainTop.add(0.5),
    positionWorld.y,
  ).oneMinus();

  // Cavity darkening folded into albedo as well as into aoNode. `aoNode` alone only touches
  // indirect light, and under the pack's overcast key that left the joints as bright as the faces —
  // the render showed no joint line at all. The cavity term is its own field (the `arrisness`
  // attribute), so this is a second consumer of an independent signal, not albedo aliased into AO.
  const arrisness = attribute<"float">("arrisness", "float");
  const cavity = arrisness
    .mul(0.62)
    .add(normalWorld.y.abs().oneMinus().mul(0.06));
  const dry = regionColor
    .mul(tone)
    .mul(meso.mul(0.34).add(0.83))
    .add(vec3(veins).mul(0.13))
    .mul(cavity.oneMinus());
  const wet = color(BASALT_SEA_STACK_PALETTE["basalt-wet"])
    .mul(tone.mul(0.85).add(0.1))
    .mul(cavity.mul(0.7).oneMinus());
  material.colorNode = mix(dry, wet, wetness);

  // Roughness is its own field, never a copy of albedo: matte dry rock at 0.88, wet rock at the
  // 0.30 the wet look-dev's sheen shows, and the upward-facing broken tops rougher still.
  const upface = smoothstep(0.45, 0.85, normalWorld.y);
  const dryRoughness = mix(float(0.88), float(0.9), upface).add(
    spall.mul(0.06),
  );
  material.roughnessNode = mix(dryRoughness, float(0.3), wetness);

  material.aoNode = vec3(1).sub(vec3(cavity));

  return material;
}

/**
 * Build the sea stack.
 *
 * Model space is metres with the origin ON THE WATERLINE: y = 0 is the top edge of the dark
 * stain, which is where the scene's water plane meets the stack. Place the returned group at the
 * water height and the reflection joins the model on a level line.
 */
export function createReferenceBasaltSeaStack(
  options: BasaltSeaStackOptions = {},
): Group {
  const field = BASALT_SEA_STACK_FIELD;
  const stainRiseMetres = options.stainRiseMetres ?? 0;
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;

  const root = new Group();
  root.name = "reference-basalt-sea-stack";

  const nodes: Record<string, Object3D> = {};
  const meshes: Record<string, Mesh> = {};
  const sockets: Record<string, Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, Object3D[]> = {};

  const material = createBasaltMaterial({ stainRiseMetres });
  const columns = buildColumnField();

  const massGroup: Object3D[] = [];
  destructionGroups["basalt-mass"] = massGroup;

  // Zone pivots. These carry no geometry of their own — every triangle belongs to a course —
  // which is what keeps the model explodable without rendering the same rock twice.
  const zonePivots = new Map<ZoneId, Group>();
  for (const zoneId of ZONE_IDS) {
    const zone = new Group();
    zone.name = zoneId;
    root.add(zone);
    nodes[zoneId] = zone;
    zonePivots.set(zoneId, zone);
    massGroup.push(zone);
  }
  const shaftPivot = new Group();
  shaftPivot.name = "submerged-shaft";
  root.add(shaftPivot);
  nodes["submerged-shaft"] = shaftPivot;
  massGroup.push(shaftPivot);

  // The submerged shaft: every column's below-waterline half, one mesh. Bible §10 — the same
  // columnar rock straight down, no plinth, no flare, no debris skirt, terminating definitely.
  const shaftBuffers = emptyBuffers();
  for (const column of columns) {
    // Closed at both ends. Leaving the cut plane open made every segment a non-manifold surface,
    // and `self_intersection.py` reported 1958 vertices "inside" their own mesh — ray parity
    // through an open bottom is undefined, so a clean verdict there would have meant nothing
    // either way. It matters for the asset's job too: an open silhouette leaks scene fog and
    // shadow.
    emitColumn(
      shaftBuffers,
      column,
      -field.submergedDepthMetres,
      0,
      "flat",
      true,
    );
  }
  const shaftMesh = new Mesh(toGeometry(shaftBuffers), material);
  shaftMesh.name = "shaft-course";
  shaftMesh.castShadow = castShadow;
  shaftMesh.receiveShadow = receiveShadow;
  shaftPivot.add(shaftMesh);
  meshes["shaft-course"] = shaftMesh;

  // Nine above-water courses, each holding the columns whose tops fall in its band.
  for (const [courseId, zoneId] of Object.entries(COURSE_ZONES)) {
    const buffers = emptyBuffers();
    let count = 0;
    for (const column of columns) {
      if (column.course !== courseId) continue;
      emitColumn(buffers, column, 0, column.topY, "broken", true);
      count += 1;
    }
    if (count === 0) continue;
    const mesh = new Mesh(toGeometry(buffers), material);
    mesh.name = courseId;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    const pivot = zonePivots.get(zoneId);
    if (!pivot) continue;
    pivot.add(mesh);
    meshes[courseId] = mesh;
  }

  const waterline = new Object3D();
  waterline.name = "waterline";
  root.add(waterline);
  sockets["waterline"] = waterline;

  const basePlane = new Object3D();
  basePlane.name = "base-plane";
  basePlane.position.set(0, -field.submergedDepthMetres, 0);
  root.add(basePlane);
  sockets["base-plane"] = basePlane;

  colliders["root"] = {
    type: "cylinder",
    radius: field.maxRadiusMetres,
    halfHeight: (field.aboveWaterHeightMetres + field.submergedDepthMetres) / 2,
    offset: [
      0,
      (field.aboveWaterHeightMetres - field.submergedDepthMetres) / 2,
      0,
    ],
  };

  nodes["root"] = root;
  root.userData.sculptRuntime = {
    nodes,
    meshes,
    sockets,
    colliders,
    destructionGroups,
  } satisfies BasaltSeaStackRuntime;
  root.userData.columnCount = columns.length;
  root.userData.stainRiseMetres = stainRiseMetres;

  /**
   * Present and deliberately empty. `docs/reference-bible.md` §10 fixes this asset as a distant
   * silhouette and reflection subject; it has no moving part and none was invented for it. The
   * hook exists so the runtime hierarchy is uniform with the animated assets, and the empty body
   * is the record that "static" was a decision rather than an omission.
   */
  root.userData.tick = (): void => {};

  return root;
}

export function disposeReferenceBasaltSeaStack(root: Group): void {
  const runtime = root.userData.sculptRuntime as
    BasaltSeaStackRuntime | undefined;
  if (!runtime) return;
  const materials = new Set<unknown>();
  for (const mesh of Object.values(runtime.meshes)) {
    mesh.geometry.dispose();
    materials.add(mesh.material);
  }
  for (const material of materials) {
    (material as { dispose?: () => void }).dispose?.();
  }
}
