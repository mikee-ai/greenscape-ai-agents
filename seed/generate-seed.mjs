/**
 * Deterministic seed generator → writes ./seed/seed.sql
 *
 *   node seed/generate-seed.mjs
 *
 * Produces:
 *   • settings (singleton)
 *   • pricing_catalog  (~200 realistic Phoenix hardscape/landscape line items)
 *   • leads            (1,400 closed-lost + a few active demo leads)
 *
 * Uses a seeded PRNG so output is byte-identical on every run (the generated
 * seed.sql is committed). IDs are stable + readable, and all INSERTs use
 * `OR IGNORE` so applying the seed is idempotent.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── seeded PRNG (mulberry32) ──────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260601);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const rint = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p) => rnd() < p;
const esc = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return "'" + String(v).replace(/'/g, "''") + "'";
};

const BASE_TS = Date.parse("2026-06-01T00:00:00Z");
const DAY = 86_400_000;

// ── pricing catalog ───────────────────────────────────────────────────
const catalog = [];
const seenSku = new Set();
function add(category, sku, name, unit, costDollars, marginPct, opts = {}) {
  if (seenSku.has(sku)) return;
  seenSku.add(sku);
  catalog.push({
    id: "cat_" + sku,
    sku,
    category,
    name,
    description: opts.description ?? null,
    unit,
    unit_price_cents: Math.round(costDollars * 100),
    default_margin_pct: marginPct,
    taxable: opts.taxable ?? true,
    active: true,
    keywords: opts.keywords ?? null,
  });
}
const slug = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

// PAVING — brand × tier expansion (cost $/sqft; 35% margin)
const paverBrands = ["Belgard", "Techo-Bloc", "Pavestone", "Tremron", "Unilock", "Angelus"];
const paverTiers = [
  ["Standard", 11.5, 0.35],
  ["Premium", 15.0, 0.38],
  ["Luxury", 19.5, 0.4],
];
for (const b of paverBrands)
  for (const [tier, cost, m] of paverTiers)
    add("paving", `PAVER_${slug(b)}_${slug(tier)}`, `${b} Paver Patio — ${tier}`, "sqft", cost, m, {
      keywords: "paver,patio,brick,hardscape,walkway",
      description: `${tier}-grade ${b} pavers, installed over compacted aggregate base with polymeric sand.`,
    });
add("paving", "PAVER_DRIVEWAY_STD", "Paver Driveway — Standard", "sqft", 14, 0.35, { keywords: "driveway,paver" });
add("paving", "PAVER_DRIVEWAY_PREM", "Paver Driveway — Premium", "sqft", 18, 0.38, { keywords: "driveway,paver" });
add("paving", "PAVER_WALKWAY", "Paver Walkway", "sqft", 13, 0.36, { keywords: "walkway,path,paver" });
add("paving", "PERMEABLE_PAVERS", "Permeable Pavers", "sqft", 17, 0.37, { keywords: "permeable,drainage,paver" });
const travTiers = [["Standard", 17, 0.36], ["Premium", 22, 0.38], ["Tumbled", 24, 0.4]];
for (const [t, c, m] of travTiers)
  add("paving", `TRAVERTINE_${slug(t)}`, `Travertine Patio — ${t}`, "sqft", c, m, { keywords: "travertine,natural stone,patio" });
add("paving", "FLAGSTONE_AZ", "Arizona Flagstone (mortar set)", "sqft", 19, 0.38, { keywords: "flagstone,natural stone" });
add("paving", "FLAGSTONE_OK", "Oklahoma Flagstone (mortar set)", "sqft", 21, 0.38, { keywords: "flagstone,natural stone" });
add("paving", "STAMPED_CONC_STD", "Stamped Concrete — Standard", "sqft", 9, 0.35, { keywords: "concrete,stamped" });
add("paving", "STAMPED_CONC_PREM", "Stamped Concrete — Premium (2-color)", "sqft", 12, 0.37, { keywords: "concrete,stamped" });
add("paving", "BROOM_CONCRETE", "Broom-Finish Concrete", "sqft", 7, 0.33, { keywords: "concrete,slab" });
add("paving", "POOL_DECK_PAVER", "Pool Deck — Pavers", "sqft", 14, 0.37, { keywords: "pool deck,coping,paver" });
add("paving", "POOL_DECK_TRAV", "Pool Deck — Travertine", "sqft", 20, 0.39, { keywords: "pool deck,travertine" });
add("paving", "POOL_DECK_COOL", "Pool Deck — Cool Deck Resurface", "sqft", 6, 0.34, { keywords: "pool deck,cool deck" });
for (const [t, c] of [["Paver", 22], ["Travertine", 28], ["Flagstone", 30]])
  add("paving", `POOL_COPING_${slug(t)}`, `Pool Coping — ${t}`, "linear_ft", c, 0.38, { keywords: "coping,pool" });

// WALLS (linear_ft or sqft face)
const wallHeights = [2, 3, 4, 6];
for (const h of wallHeights) {
  add("walls", `RETWALL_BLOCK_${h}FT`, `Retaining Wall — Block, ${h}ft`, "linear_ft", 18 + h * 11, 0.36, { keywords: "retaining wall,block,grade" });
  add("walls", `RETWALL_STONE_${h}FT`, `Retaining Wall — Natural Stone, ${h}ft`, "linear_ft", 28 + h * 16, 0.4, { keywords: "retaining wall,stone" });
}
add("walls", "RETWALL_POURED", "Retaining Wall — Poured Concrete (per face sqft)", "sqft", 26, 0.36, { keywords: "retaining wall,concrete" });
for (const [t, c] of [["Block", 110], ["Stone Veneer", 165], ["Stucco", 95]])
  add("walls", `SEATWALL_${slug(t)}`, `Seat Wall — ${t}`, "linear_ft", c, 0.4, { keywords: "seat wall,bench" });
for (const [t, c] of [["Block", 95], ["Stone", 150]])
  add("walls", `PLANTERWALL_${slug(t)}`, `Planter Wall — ${t}`, "linear_ft", c, 0.4, { keywords: "planter,raised bed wall" });
add("walls", "PILASTER_COLUMN", "Pilaster / Column", "each", 650, 0.42, { keywords: "column,pilaster,gate" });
add("walls", "STUCCO_FINISH", "Stucco Finish (per sqft)", "sqft", 7, 0.35, { keywords: "stucco,wall finish" });
add("walls", "STONE_VENEER", "Natural Stone Veneer (per sqft)", "sqft", 24, 0.4, { keywords: "veneer,stone facing" });
add("walls", "PRIVACY_WALL", "Block Privacy Wall (per face sqft)", "sqft", 22, 0.36, { keywords: "privacy,fence wall" });

// STRUCTURES (each / lump)
for (const [t, c, m] of [["Wood Standard", 6500, 0.4], ["Wood Premium", 11500, 0.42], ["Aluminum", 9500, 0.4], ["Steel Modern", 14500, 0.43]])
  add("structures", `PERGOLA_${slug(t)}`, `Pergola — ${t}`, "each", c, m, { keywords: "pergola,shade,patio cover" });
for (const [t, c] of [["Standard", 12500], ["Premium", 22000]])
  add("structures", `RAMADA_${slug(t)}`, `Ramada — ${t}`, "each", c, 0.42, { keywords: "ramada,gazebo,shade structure" });
add("structures", "GAZEBO", "Gazebo", "each", 9500, 0.42, { keywords: "gazebo,structure" });
add("structures", "SHADE_SAIL", "Shade Sail System", "each", 3200, 0.4, { keywords: "shade sail,canopy" });
add("structures", "LOUVERED_PERGOLA", "Louvered Pergola (motorized)", "each", 18500, 0.44, { keywords: "louvered,motorized,pergola" });
for (const [t, c, m] of [["Basic", 8500, 0.42], ["Standard", 18000, 0.44], ["Luxury", 36000, 0.46]])
  add("structures", `OUTDOOR_KITCHEN_${slug(t)}`, `Outdoor Kitchen — ${t}`, "each", c, m, { keywords: "outdoor kitchen,bbq,island,grill" });
add("structures", "BBQ_ISLAND", "BBQ Island (built-in grill)", "each", 6500, 0.43, { keywords: "bbq,island,grill" });
add("structures", "OUTDOOR_BAR", "Outdoor Bar w/ Seating", "each", 7800, 0.43, { keywords: "bar,counter,outdoor" });
for (const [t, c] of [["Gas Standard", 2800], ["Gas Premium", 4800], ["Wood-Burning", 2200], ["Custom Stone", 7500]])
  add("structures", `FIREPIT_${slug(t)}`, `Fire Pit — ${t}`, "each", c, 0.44, { keywords: "fire pit,fire feature" });
for (const [t, c] of [["Standard", 7500], ["Custom Stone", 13500], ["See-Through", 16500]])
  add("structures", `FIREPLACE_${slug(t)}`, `Outdoor Fireplace — ${t}`, "each", c, 0.45, { keywords: "fireplace,fire feature" });

// WATER FEATURES
for (const [t, c] of [["Small", 5200], ["Medium", 8500], ["Large", 13500]])
  add("water", `PONDLESS_${slug(t)}`, `Pondless Waterfall — ${t}`, "each", c, 0.44, { keywords: "waterfall,pondless,water feature" });
for (const [t, c] of [["Small", 6500], ["Large", 12500]])
  add("water", `POND_${slug(t)}`, `Koi/Garden Pond — ${t}`, "each", c, 0.44, { keywords: "pond,koi,water feature" });
for (const [t, c] of [["Standard", 2400], ["Premium", 4800], ["Custom", 8500]])
  add("water", `FOUNTAIN_${slug(t)}`, `Fountain — ${t}`, "each", c, 0.44, { keywords: "fountain,water feature" });
add("water", "BUBBLER_URN", "Bubbler Urn / Vase", "each", 1450, 0.45, { keywords: "bubbler,urn,water feature" });
add("water", "WATER_WALL", "Water Feature Wall", "each", 7800, 0.45, { keywords: "water wall,sheet,feature" });
add("water", "SPA_SPILLOVER", "Spa Spillover Feature", "each", 9500, 0.45, { keywords: "spa,spillover,water" });

// TURF / LANDSCAPE
for (const [t, c] of [["Pet-Grade", 9], ["Standard", 10.5], ["Premium", 13], ["Putting Green", 16]])
  add("turf", `TURF_${slug(t)}`, `Artificial Turf — ${t}`, "sqft", c, 0.38, { keywords: "artificial turf,synthetic grass,putting green" });
add("turf", "SOD_INSTALL", "Natural Sod Install", "sqft", 1.6, 0.35, { keywords: "sod,grass,lawn" });
add("turf", "DG_INSTALL", "Decomposed Granite", "sqft", 1.3, 0.34, { keywords: "decomposed granite,dg,gravel" });
add("turf", "RIP_RAP", "Rip-Rap / Decorative Rock", "sqft", 2.1, 0.34, { keywords: "rock,gravel,desert" });
add("turf", "MULCH_INSTALL", "Mulch / Bark Install", "sqft", 1.1, 0.33, { keywords: "mulch,bark" });
for (const [t, c] of [["Shrub (5 gal)", 38], ["Shrub (15 gal)", 95], ["Accent (Agave/Cactus)", 120]])
  add("turf", `PLANT_${slug(t)}`, `Planting — ${t}`, "each", c, 0.4, { keywords: "plant,shrub,landscaping" });
for (const [t, c] of [["Tree 15 gal", 150], ["Tree 24in box", 420], ["Tree 36in box", 950], ["Palm", 850]])
  add("turf", `TREE_${slug(t)}`, `Tree — ${t}`, "each", c, 0.4, { keywords: "tree,palm,shade" });
for (const [t, c] of [["Small", 180], ["Medium", 420], ["Large", 950]])
  add("turf", `BOULDER_${slug(t)}`, `Boulder — ${t} (placed)`, "each", c, 0.4, { keywords: "boulder,rock,accent" });
add("turf", "RAISED_GARDEN", "Raised Garden Bed", "each", 850, 0.4, { keywords: "garden,raised bed,vegetable" });
add("turf", "SOIL_PREP", "Soil Amendment & Prep", "sqft", 0.9, 0.32, { keywords: "soil,amend,prep" });

// IRRIGATION
add("irrigation", "DRIP_ZONE", "Drip Irrigation — per Zone", "each", 420, 0.36, { keywords: "irrigation,drip,zone" });
add("irrigation", "SPRAY_ZONE", "Spray Irrigation — per Zone", "each", 480, 0.36, { keywords: "irrigation,spray,sprinkler" });
add("irrigation", "SMART_CONTROLLER", "Smart Irrigation Controller", "each", 380, 0.38, { keywords: "irrigation,controller,smart" });
add("irrigation", "IRRIGATION_MAIN", "Irrigation Mainline (per linear ft)", "linear_ft", 6, 0.34, { keywords: "irrigation,mainline" });
add("irrigation", "IRRIGATION_REPAIR", "Irrigation Repair / Modification", "hour", 85, 0.3, { keywords: "irrigation,repair" });

// LIGHTING
for (const [t, c] of [["Path Light", 165], ["Up/Spot Light", 185], ["Step Light", 145], ["Wall Sconce", 220], ["Hardscape Light", 130]])
  add("lighting", `LIGHT_${slug(t)}`, `Landscape Lighting — ${t} (installed)`, "each", c, 0.4, { keywords: "lighting,low voltage,fixture" });
add("lighting", "LIGHT_TRANSFORMER", "Lighting Transformer + Timer", "each", 420, 0.38, { keywords: "lighting,transformer" });
add("lighting", "STRING_LIGHTS", "Cafe / String Light Install", "linear_ft", 14, 0.36, { keywords: "string lights,cafe,bistro" });
add("lighting", "SMART_LIGHTING", "Smart Lighting Controller", "each", 480, 0.4, { keywords: "lighting,smart,app" });

// DRAINAGE / SITE PREP / DEMO
add("demo", "DEMO_CONCRETE", "Demo — Concrete (per sqft)", "sqft", 3.2, 0.3, { keywords: "demo,removal,concrete" });
add("demo", "DEMO_PAVERS", "Demo — Pavers (per sqft)", "sqft", 2.4, 0.3, { keywords: "demo,removal,paver" });
add("demo", "DEMO_LANDSCAPE", "Demo — Landscape/Vegetation (per sqft)", "sqft", 1.4, 0.3, { keywords: "demo,clearing" });
add("demo", "GRADING", "Grading & Leveling (per sqft)", "sqft", 1.8, 0.32, { keywords: "grading,level,site prep" });
add("demo", "EXCAVATION", "Excavation (per cubic yard)", "each", 65, 0.32, { keywords: "excavation,dig" });
add("demo", "BASE_PREP", "Aggregate Base Prep (per sqft)", "sqft", 2.6, 0.33, { keywords: "base,abc,aggregate,prep" });
add("demo", "HAUL_OFF", "Debris Haul-Off (per load)", "each", 380, 0.3, { keywords: "haul,dumpster,debris" });
add("demo", "FRENCH_DRAIN", "French Drain (per linear ft)", "linear_ft", 22, 0.35, { keywords: "drainage,french drain" });
add("demo", "CHANNEL_DRAIN", "Channel Drain (per linear ft)", "linear_ft", 34, 0.35, { keywords: "drainage,channel,trench drain" });
add("demo", "CATCH_BASIN", "Catch Basin (each)", "each", 240, 0.34, { keywords: "drainage,catch basin" });
add("demo", "SOD_REMOVAL", "Sod / Grass Removal (per sqft)", "sqft", 1.1, 0.3, { keywords: "removal,sod,grass" });

// TRADES (gas / electrical / plumbing)
add("trades", "GAS_LINE", "Gas Line Run (per linear ft)", "linear_ft", 28, 0.35, { keywords: "gas,line,fire,bbq" });
add("trades", "ELEC_OUTLET", "Exterior Outlet / GFCI (each)", "each", 285, 0.36, { keywords: "electrical,outlet,gfci" });
add("trades", "ELEC_SUBPANEL", "Electrical Sub-Panel", "each", 1850, 0.36, { keywords: "electrical,panel,power" });
add("trades", "PLUMBING_FEATURE", "Plumbing for Water Feature", "each", 950, 0.36, { keywords: "plumbing,water,feature" });
add("trades", "GAS_STUB", "Gas Stub-Out (each)", "each", 420, 0.35, { keywords: "gas,stub,connection" });

// FEES / SERVICES (low/zero margin)
add("fees", "DESIGN_FEE", "Design & Engineering Fee", "lump", 1500, 0.1, { keywords: "design,plan,engineering", taxable: false });
add("fees", "RENDER_3D", "3D Rendering Package", "each", 650, 0.15, { keywords: "render,3d,visual", taxable: false });
add("fees", "PERMIT_PHX", "Permit — City of Phoenix", "lump", 850, 0.0, { keywords: "permit,city", taxable: false });
add("fees", "PERMIT_HOA", "HOA Submission Package", "lump", 350, 0.0, { keywords: "hoa,submission,approval", taxable: false });
add("fees", "MOBILIZATION", "Mobilization / Site Setup", "lump", 1200, 0.2, { keywords: "mobilization,setup", taxable: false });
add("fees", "PROJECT_MGMT", "Project Management", "lump", 1800, 0.15, { keywords: "management,supervision", taxable: false });
add("fees", "FINAL_CLEANUP", "Final Cleanup & Detail", "lump", 650, 0.25, { keywords: "cleanup,detail,final", taxable: false });
add("fees", "EQUIP_RENTAL", "Equipment Rental", "each", 450, 0.2, { keywords: "equipment,rental,machine", taxable: false });
add("fees", "CONCRETE_PUMP", "Concrete Pump (per day)", "each", 950, 0.2, { keywords: "concrete,pump", taxable: false });
add("fees", "WARRANTY_EXT", "Extended Workmanship Warranty", "lump", 600, 0.3, { keywords: "warranty,guarantee", taxable: false });

// ── leads ─────────────────────────────────────────────────────────────
const FIRST = ["James","Mary","Robert","Jennifer","Michael","Linda","David","Patricia","John","Elizabeth","Daniel","Susan","Matthew","Jessica","Anthony","Karen","Mark","Nancy","Steven","Lisa","Paul","Sandra","Andrew","Ashley","Joshua","Kimberly","Kevin","Donna","Brian","Carol","Carlos","Maria","Luis","Sofia","Diego","Elena","Miguel","Carmen","Ahmed","Priya","Wei","Mei","Raj","Anita","Tyler","Brittany","Jordan","Amber","Cody","Megan"];
const LAST = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Patel","Kim","Nakamura","Khan","Reed","Cook","Bailey","Rivera","Cooper","Bell"];
const CITIES = [["Phoenix","850"],["Scottsdale","852"],["Mesa","852"],["Chandler","852"],["Gilbert","852"],["Tempe","852"],["Glendale","853"],["Peoria","853"],["Paradise Valley","852"],["Cave Creek","853"]];
const STREETS = ["Camelback","Desert Cove","Saguaro","Mesquite","Pinnacle Peak","Shea","Thunderbird","Cactus","Bell","Greenway","Sweetwater","Acoma","Hayden","Scottsdale","Via Linda","Lone Mountain","Dynamite","Carefree","Frank Lloyd Wright","Tatum"];
const STREET_TYPE = ["Rd","Dr","Ln","Way","Blvd","Ct","Pl","Ave"];
const PROJECT_TYPES = ["paver_patio","pool_deck","outdoor_kitchen","full_yard","fire_feature","artificial_turf","pergola","water_feature","retaining_wall","driveway"];
// realistic budget ranges ($k) per project type so notes never read absurd
const BUDGET_RANGE = {
  paver_patio: [12, 45], pool_deck: [15, 50], outdoor_kitchen: [18, 75], full_yard: [35, 120],
  fire_feature: [8, 30], artificial_turf: [8, 25], pergola: [10, 40], water_feature: [8, 35],
  retaining_wall: [10, 45], driveway: [12, 40],
};
const FEATURES = {
  paver_patio: ["a paver patio","a built-in gas fire pit","a seat wall","cafe lighting"],
  pool_deck: ["a travertine pool deck","new coping","a baja shelf surround","pool deck pavers"],
  outdoor_kitchen: ["an outdoor kitchen","a built-in BBQ island","a pizza oven","bar seating"],
  full_yard: ["a full backyard remodel","artificial turf","a pergola","a water feature","landscape lighting"],
  fire_feature: ["a custom stone fireplace","a gas fire pit","a fire-and-water feature"],
  artificial_turf: ["artificial turf","a putting green","pet-grade turf"],
  pergola: ["a steel modern pergola","a louvered pergola","a wood ramada"],
  water_feature: ["a pondless waterfall","a fountain","a water feature wall"],
  retaining_wall: ["a natural stone retaining wall","a terraced seat wall","grading and drainage"],
  driveway: ["a paver driveway","a stamped concrete driveway","driveway widening"],
};
const NEIGHBORHOODS = ["DC Ranch","Grayhawk","McCormick Ranch","Desert Ridge","Silverleaf","Troon","Ahwatukee","Arcadia","Estrella","Verrado","Eastmark","Power Ranch"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const LOST_REASONS = [
  ["competitor", "Went with a competitor who quoted faster."],
  ["competitor", "Chose another contractor — said our quote took too long to arrive."],
  ["price", "Said our number was over their budget."],
  ["price", "Price-shopped; went with a cheaper bid."],
  ["went_cold", "Went cold after the site walk — never responded to the proposal."],
  ["went_cold", "Ghosted after we sent the proposal."],
  ["timing", "Wanted it done in 2 weeks; we were booked out."],
  ["timing", "Said 'maybe next season' and never came back."],
  ["hoa", "HOA approval fell through."],
  ["budget", "Decided to wait until next year for budget reasons."],
  ["unresponsive", "Stopped replying mid-conversation."],
  ["renting", "Turned out they were renting, not the homeowner."],
];
const PERSONAL = [
  "Mentioned wanting it done before a daughter's graduation party.",
  "Has two big dogs — pet-grade turf was a priority.",
  "Hosts a lot and wanted the yard ready for the holidays.",
  "Just moved in and the backyard is 'a dirt lot right now.'",
  "Loved our Instagram project photos.",
  "Was comparing us to a referral from their neighbor.",
  "Said the pool area gets brutal in summer and needs shade.",
  "Wanted something low-maintenance for retirement.",
  "Kept going back and forth on pavers vs. travertine.",
  "Worried about HOA approval timelines.",
  "Their spouse needed convincing on the budget.",
  "Wanted to photograph well for a future home sale.",
  null,
  null,
];

const leads = [];
function makeLead(i, lifecycle) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const [city, zipPrefix] = pick(CITIES);
  const pt = pick(PROJECT_TYPES);
  const feats = FEATURES[pt];
  const chosen = [...new Set([feats[0], ...(chance(0.6) ? [pick(feats)] : []), ...(chance(0.3) ? [pick(feats)] : [])])];
  const [bMin, bMax] = BUDGET_RANGE[pt];
  const budgetK = rint(bMin, bMax);
  const monthsAgo = rint(2, 36);
  const createdAt = BASE_TS - monthsAgo * 30 * DAY - rint(0, 28) * DAY;
  const lostAt = createdAt + rint(7, 55) * DAY;
  const lostMonth = MONTHS[new Date(lostAt).getUTCMonth()];
  const lostYear = new Date(lostAt).getUTCFullYear();
  const [reasonKey, reasonText] = pick(LOST_REASONS);
  const personal = pick(PERSONAL);
  const area = pick(["602", "480", "623"]);
  const phone = `(${area}) ${rint(200, 989)}-${String(rint(1000, 9999))}`;
  const hood = chance(0.5) ? ` in ${pick(NEIGHBORHOODS)}` : "";
  const featText = chosen.length > 1 ? chosen.slice(0, -1).join(", ") + " and " + chosen.slice(-1) : chosen[0];

  const notes =
    `Wanted ${featText}${hood}. Budget around $${budgetK}k. ` +
    (lifecycle === "closed_lost"
      ? `Site walk done ${lostMonth} ${lostYear}. ${reasonText}` + (personal ? ` ${personal}` : "")
      : `New inquiry — needs a site walk.` + (personal ? ` ${personal}` : ""));

  return {
    id: lifecycle === "closed_lost" ? `lead_cl_${String(i).padStart(5, "0")}` : `lead_act_${String(i).padStart(3, "0")}`,
    ghl_contact_id: `ghl_${String(100000 + i)}`,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${rint(1, 99)}@example.com`,
    phone,
    address: `${rint(100, 19999)} ${pick(["E","W","N","S"])} ${pick(STREETS)} ${pick(STREET_TYPE)}, ${city}, AZ ${zipPrefix}${rint(10, 99)}`,
    project_type: pt,
    budget_hint: budgetK * 100_000, // dollars→cents
    source: pick(["meta", "meta", "google", "referral"]),
    lifecycle,
    notes,
    closed_lost_reason: lifecycle === "closed_lost" ? reasonKey : null,
    closed_lost_at: lifecycle === "closed_lost" ? lostAt : null,
    created_at: createdAt,
  };
}
for (let i = 1; i <= 1400; i++) leads.push(makeLead(i, "closed_lost"));
// a few active demo leads so the Speed-to-Quote flow has data out of the box
for (let i = 1; i <= 6; i++) leads.push(makeLead(i, "new"));

// ── emit SQL ──────────────────────────────────────────────────────────
const lines = [];
lines.push("-- Generated by seed/generate-seed.mjs — do not edit by hand.");
lines.push(`-- ${catalog.length} catalog items, ${leads.length} leads.`);
lines.push("PRAGMA foreign_keys=OFF;");
lines.push("");
lines.push(
  `INSERT OR REPLACE INTO settings (id,company_name,tax_rate_bps,deposit_pct,default_margin_pct,render_threshold_cents,low_confidence_threshold,brand_voice_notes,updated_at) VALUES (1,'Greenscape Pro',860,50,0.35,3000000,0.7,${esc(
    "Premium, warm, and confident — never salesy. We do not compete on price; we sell quality, reliability, and a finished product that photographs well. Speak like a trusted craftsman who respects the client's time. Concise.",
  )},${BASE_TS});`,
);
lines.push("");
for (const c of catalog) {
  lines.push(
    `INSERT OR IGNORE INTO pricing_catalog (id,sku,category,name,description,unit,unit_price_cents,default_margin_pct,taxable,active,keywords) VALUES (${esc(c.id)},${esc(c.sku)},${esc(c.category)},${esc(c.name)},${esc(c.description)},${esc(c.unit)},${c.unit_price_cents},${c.default_margin_pct},${esc(c.taxable)},${esc(c.active)},${esc(c.keywords)});`,
  );
}
lines.push("");
for (const l of leads) {
  lines.push(
    `INSERT OR IGNORE INTO leads (id,ghl_contact_id,name,email,phone,address,project_type,budget_hint,source,lifecycle,notes,closed_lost_reason,closed_lost_at,raw_payload,created_at) VALUES (${esc(l.id)},${esc(l.ghl_contact_id)},${esc(l.name)},${esc(l.email)},${esc(l.phone)},${esc(l.address)},${esc(l.project_type)},${l.budget_hint},${esc(l.source)},${esc(l.lifecycle)},${esc(l.notes)},${esc(l.closed_lost_reason)},${l.closed_lost_at ?? "NULL"},NULL,${l.created_at});`,
  );
}
lines.push("");
lines.push("PRAGMA foreign_keys=ON;");

writeFileSync(join(__dirname, "seed.sql"), lines.join("\n") + "\n");
console.log(`Wrote seed.sql — ${catalog.length} catalog items, ${leads.length} leads (${leads.filter((l) => l.lifecycle === "closed_lost").length} closed-lost).`);
