import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CATALOG_URL = "https://swgt.io/controllers/tools/monsterCatalog?displayAs=GRID";
const SWKIT_BESTIARY_URL = "https://www.swkit.fun/data/sw_bestiary-260731.json";
const LEGACY_API_URL = "https://swarfarm.com/api/v2/monsters/?page_size=100";
const LEGACY_IMAGE_ROOT = "https://swarfarm.com/static/herders/images/monsters";
const LEGACY_COLLAB_FAMILIES = new Set([
  24000, 24100, 24200, 24300, 24400,
  26200, 26300, 26400, 26500, 26600,
  27300, 27400, 27500, 27600, 27700,
  29200, 29300, 29400, 29500,
  30200, 30300, 30400, 30500, 30600,
  31700, 31800, 31900, 32100, 32200,
  33000, 33100, 33200, 33300, 33400,
  34300, 34400, 34600, 34700, 34800
]);
const COLLAB_REPLACEMENT_FAMILIES = new Map([
  [24000, 24500], [24100, 24600], [24200, 24700], [24300, 24800], [24400, 24900],
  [26200, 26700], [26300, 26800], [26400, 26900], [26500, 27000], [26600, 27100],
  [27300, 27800], [27400, 27900], [27500, 28000], [27600, 28100], [27700, 28200],
  [29200, 29600], [29300, 29700], [29400, 29800], [29500, 29900],
  [30200, 30800], [30300, 30900], [30400, 31000], [30500, 31100], [30600, 31200],
  [31700, 32400], [31800, 32500], [31900, 32600], [32100, 32800], [32200, 32900],
  [33000, 33500], [33100, 33600], [33200, 33700], [33300, 33800], [33400, 33900],
  [34300, 34900], [34400, 35000], [34600, 35200], [34700, 35300], [34800, 35400]
]);
const GIFT_MONSTER_KEYS = new Set([
  "24600-Fire",
  "26700-Wind",
  "27800-Light",
  "29600-Water",
  "30800-Dark",
  "32400-Wind",
  "33500-Fire",
  "34900-Water",
  "35600-Water",
  "1000100-Fire",
  "1000100-Water",
  "1000100-Wind",
  "1000200-Light",
  "1000200-Dark"
]);
const ANCIENT_SHOP_MONSTER_KEYS = new Set([
  "19100-Light",
  "19200-Light",
  "19300-Dark",
  "23000-Dark",
  "24600-Fire",
  "26700-Wind",
  "27800-Light",
  "29600-Water",
  "30800-Dark",
  "32400-Wind",
  "33500-Fire",
  "34900-Water",
  "35600-Water"
]);
const root = process.cwd();
const dataDir = path.join(root, "data");
const imageDir = path.join(root, "assets", "monsters");

await mkdir(dataDir, { recursive: true });
await mkdir(imageDir, { recursive: true });

async function getResponse(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "SwTools/1.0" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw lastError;
}

function decodeHtml(value) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const number = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  }).trim();
}

console.log("Downloading current SWGT monster catalog...");
const html = await (await getResponse(CATALOG_URL)).text();
const pattern = /<div class="imageContainer swgt-monster-tile[^"]*"[^>]*data-monstername="([^"]*)" data-monsterunawakenedname="([^"]*)" data-monsterelement="([^"]*)" data-monsternaturalstars="(\d+)"[\s\S]*?<a href="\/monsterSearch\/\?com2usID=(\d+)">[\s\S]*?<img[^>]*data-src="([^"]+)"/g;
const forms = [...html.matchAll(pattern)].map((match) => ({
  name: decodeHtml(match[1]),
  unawakenedName: decodeHtml(match[2]),
  element: match[3],
  stars: Number(match[4]),
  id: Number(match[5]),
  imageUrl: decodeHtml(match[6])
}));

if (forms.length < 800) {
  throw new Error(`SWGT catalog parsing returned only ${forms.length} forms; refusing to overwrite the local catalog.`);
}

console.log("Downloading Chinese names from SWKit...");
const swkitBestiary = await (await getResponse(SWKIT_BESTIARY_URL)).json();
if (!Array.isArray(swkitBestiary.monsters) || swkitBestiary.monsters.length < 1500) {
  throw new Error("SWKit bestiary is incomplete; refusing to overwrite Chinese names.");
}
const swkitById = new Map(swkitBestiary.monsters.map((monster) => [Number(monster.id), monster]));

const grouped = new Map();
for (const form of forms) {
  const familyId = Math.floor(form.id / 100) * 100;
  const key = `${familyId}-${form.element}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(form);
}

const rank = (id) => Math.floor((id % 100) / 10);
const catalog = [...grouped.entries()].map(([key, group]) => {
  group.sort((a, b) => rank(a.id) - rank(b.id));
  const first = group[0];
  const awakened = group.find((form) => rank(form.id) === 1) || first;
  const finalForm = group.at(-1);
  const familyId = Math.floor(first.id / 100) * 100;
  const attribute = first.id % 10;
  const knownRanks = new Set(group.map((form) => rank(form.id)));
  const ids = new Set(group.map((form) => form.id));
  ids.add(familyId + attribute);
  if (first.unawakenedName || knownRanks.has(1) || knownRanks.has(3)) ids.add(familyId + 10 + attribute);
  if (knownRanks.has(3)) ids.add(familyId + 30 + attribute);
  const imageName = new URL(finalForm.imageUrl).pathname.split("/").at(-1);
  return {
    key,
    familyId,
    element: first.element,
    stars: first.stars,
    archetype: "",
    nameEn: first.unawakenedName || first.name,
    awakenedNameEn: awakened.name,
    nameZh: "",
    awakenedNameZh: "",
    aliases: [],
    image: `assets/monsters/${imageName}`,
    sourceImage: finalForm.imageUrl,
    ids: [...ids].sort((a, b) => a - b),
    awakenLevel: Math.max(...group.map((form) => rank(form.id)))
  };
});

// SWGT intentionally hides some expired collaboration originals. Preserve those
// historical IDs from SWARFARM without using it to determine current monsters.
let legacyForms = [];
try {
  let next = LEGACY_API_URL;
  while (next) {
    const payload = await (await getResponse(next)).json();
    legacyForms.push(...payload.results);
    next = payload.next;
    process.stdout.write(`\rHistorical forms ${legacyForms.length}/${payload.count}`);
  }
  process.stdout.write("\n");
} catch (error) {
  console.warn(`Historical fallback unavailable: ${error.message}`);
}

const catalogByKey = new Map(catalog.map((monster) => [monster.key, monster]));
const legacyGroups = new Map();
for (const form of legacyForms) {
  if (!form.com2us_id || !form.family_id || !form.element || !form.image_filename) continue;
  if (!LEGACY_COLLAB_FAMILIES.has(form.family_id)) continue;
  const targetFamilyId = COLLAB_REPLACEMENT_FAMILIES.get(form.family_id) || form.family_id;
  const key = `${targetFamilyId}-${form.element}`;
  if (!legacyGroups.has(key)) legacyGroups.set(key, []);
  legacyGroups.get(key).push(form);
}

for (const [key, group] of legacyGroups) {
  const existing = catalogByKey.get(key);
  if (existing) {
    existing.ids = [...new Set([...existing.ids, ...group.map((form) => form.com2us_id)])].sort((a, b) => a - b);
    existing.aliases = [...new Set([
      ...existing.aliases,
      ...group.flatMap((form) => [form.name, form.homunculus_name]).filter(Boolean)
    ])];
    continue;
  }
  if (COLLAB_REPLACEMENT_FAMILIES.has(group[0].family_id)) {
    throw new Error(`Missing replacement catalog entry ${key} for collaboration family ${group[0].family_id}.`);
  }
  group.sort((a, b) => a.awaken_level - b.awaken_level);
  const first = group[0];
  const awakened = group.find((form) => form.awaken_level === 1) || group.at(-1);
  const finalForm = group.at(-1);
  const entry = {
    key,
    familyId: first.family_id,
    element: first.element,
    stars: first.natural_stars,
    archetype: first.archetype || "",
    nameEn: (group.find((form) => form.awaken_level === 0) || first).name,
    awakenedNameEn: awakened.name,
    nameZh: "",
    awakenedNameZh: "",
    aliases: [],
    image: `assets/monsters/${finalForm.image_filename}`,
    sourceImage: `${LEGACY_IMAGE_ROOT}/${finalForm.image_filename}`,
    ids: [...new Set(group.map((form) => form.com2us_id))].sort((a, b) => a - b),
    awakenLevel: finalForm.awaken_level,
    legacy: true
  };
  catalog.push(entry);
  catalogByKey.set(key, entry);
}

for (const monster of catalog) {
  const forms = monster.ids.map((id) => swkitById.get(Number(id))).filter(Boolean);
  const currentForms = forms.filter((form) => Math.floor(Number(form.id) / 100) * 100 === monster.familyId);
  const preferred = currentForms.length ? currentForms : forms;
  const base = preferred.find((form) => Number(form.awaken) === 0) || preferred[0];
  const awakened = preferred.find((form) => Number(form.awaken) === 1) || preferred.at(-1);
  monster.nameZh = base?.name_cn || "";
  monster.awakenedNameZh = awakened?.name_cn || monster.nameZh;
  if (forms.some((form) => form.src?.includes("Fusion"))) monster.fusion = true;
  if (ANCIENT_SHOP_MONSTER_KEYS.has(monster.key)) monster.ancientShop = true;
  if (monster.stars === 5 && (GIFT_MONSTER_KEYS.has(monster.key) || monster.fusion || monster.ancientShop)) monster.gift = true;
}

catalog.sort((a, b) => b.stars - a.stars || a.familyId - b.familyId || a.element.localeCompare(b.element));

const uniqueImages = [...new Map(catalog.map((monster) => [monster.image, monster.sourceImage])).entries()];
console.log(`Parsed ${forms.length} forms into ${catalog.length} catalog entries.`);
console.log(`Downloading ${uniqueImages.length} local icons...`);
let completed = 0;
let failed = 0;
const workers = Array.from({ length: 12 }, async (_, workerIndex) => {
  for (let index = workerIndex; index < uniqueImages.length; index += 12) {
    const [relativePath, url] = uniqueImages[index];
    const destination = path.join(root, relativePath);
    if (!existsSync(destination)) {
      try {
        const response = await getResponse(url, 3);
        await writeFile(destination, Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        failed += 1;
        console.warn(`\nFailed ${url}: ${error.message}`);
      }
    }
    completed += 1;
    if (completed % 25 === 0 || completed === uniqueImages.length) process.stdout.write(`\rIcons ${completed}/${uniqueImages.length}`);
  }
});
await Promise.all(workers);
process.stdout.write("\n");

const generatedAt = new Date().toISOString();
const output = `// Generated from the SWGT monster catalog at ${generatedAt}.\nwindow.MONSTER_CATALOG = ${JSON.stringify(catalog)};\n`;
await writeFile(path.join(dataDir, "monsters.js"), output, "utf8");
await writeFile(path.join(dataDir, "source.json"), JSON.stringify({ source: "SWGT", sourceUrl: CATALOG_URL, chineseNamesSource: "SWKit", chineseNamesUrl: SWKIT_BESTIARY_URL, chineseNamesVersion: swkitBestiary.ver, historicalFallback: "SWARFARM", generatedAt, currentForms: forms.length, historicalForms: legacyForms.length, entries: catalog.length }, null, 2), "utf8");
console.log(`Wrote ${catalog.length} current catalog entries. Icon failures: ${failed}.`);
