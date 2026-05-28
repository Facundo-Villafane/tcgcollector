import { promises as fs } from "fs";
import path from "path";
import type { DigimonCard } from "@/lib/types";

type HeroiccCard = {
  data: {
    id: string;
    attributes: {
      name: string;
      number: string;
      category?: string | null;
      "parallel-id"?: number | null;
      level?: number | null;
      dp?: number | null;
      "play-cost"?: number | null;
      "use-cost"?: number | null;
      rarity?: string | null;
      form?: string | null;
      color?: string[] | null;
      image?: string | null;
      effect?: string | null;
      "inherited-effect"?: string | null;
      releases?: Array<{ name?: string | null }> | null;
      "digivolution-requirements"?: Array<{ cost?: number | null }> | null;
    };
  };
};

const API_URL = "https://assets.heroi.cc/bulk-data/en-2026-05-27-090217.json";
const USER_AGENT = "DigimonInventoryApp/1.0";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const CACHE_VERSION = 3;
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "digimon-cards.json");

let memoryCache: { cards: DigimonCard[]; fetchedAt: number; version: number } | null = null;

export async function getDigimonCards(): Promise<DigimonCard[]> {
  const now = Date.now();

  if (memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.cards;
  }

  const diskCache = await readDiskCache();
  if (diskCache && now - diskCache.fetchedAt < CACHE_TTL_MS) {
    memoryCache = diskCache;
    return diskCache.cards;
  }

  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    next: {
      revalidate: 60 * 60 * 12,
    },
  });

  if (!response.ok) {
    if (diskCache) {
      memoryCache = diskCache;
      return diskCache.cards;
    }

    throw new Error(`Heroicc returned ${response.status}`);
  }

  const rawCards = (await response.json()) as HeroiccCard[];
  const cards = rawCards
    .map(normalizeCard)
    .filter((card): card is DigimonCard => Boolean(card))
    .sort((a, b) => a.cardNumber.localeCompare(b.cardNumber) || a.parallelId - b.parallelId);
  const cache = { cards, fetchedAt: now, version: CACHE_VERSION };

  memoryCache = cache;
  await writeDiskCache(cache);

  return cards;
}

function normalizeCard(card: HeroiccCard): DigimonCard | null {
  const attributes = card.data.attributes;
  const number = attributes.number;
  const parallelId = attributes["parallel-id"] ?? 0;
  const category = attributes.category ?? "";

  if (!number || !attributes.name) {
    return null;
  }

  return {
    id: parallelId > 0 ? `${number}_P${parallelId}` : number,
    name: attributes.name,
    cardNumber: number,
    variantLabel: parallelId > 0 ? `Alt Art P${parallelId}` : "Regular Art",
    isAlternateArt: parallelId > 0,
    parallelId,
    setCode: number.split("-")[0] ?? "",
    setName: attributes.releases?.[0]?.name ?? "",
    color: attributes.color?.map(capitalize) ?? ["Colorless"],
    type: category ? toCardType(category) : "Digimon",
    rarity: attributes.rarity ?? "Unknown",
    level: attributes.level ?? undefined,
    playCost: attributes["play-cost"] ?? attributes["use-cost"] ?? undefined,
    digivolveCost: attributes["digivolution-requirements"]?.[0]?.cost ?? undefined,
    dp: attributes.dp ?? undefined,
    imageUrl: attributes.image ?? `https://images.heroi.cc/cards/en/${number}.webp`,
    effect: attributes.effect || attributes["inherited-effect"] || "",
    form: attributes.form ?? undefined,
  };
}

function toCardType(category: string) {
  const normalized = category.toLowerCase();

  if (normalized === "digi-egg") return "Digi-Egg";
  return capitalize(normalized);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function readDiskCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const cache = JSON.parse(raw) as { cards: DigimonCard[]; fetchedAt: number; version?: number };
    return cache.version === CACHE_VERSION ? { ...cache, version: CACHE_VERSION } : null;
  } catch {
    return null;
  }
}

async function writeDiskCache(cache: { cards: DigimonCard[]; fetchedAt: number; version: number }) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Cache failures should not break the app.
  }
}
