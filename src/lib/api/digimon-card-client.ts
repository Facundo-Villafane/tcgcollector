import { promises as fs } from "fs";
import path from "path";
import type { DigimonCard } from "@/lib/types";

type ApiCard = {
  name: string;
  type: string;
  id: string;
  level?: number | null;
  play_cost?: number | null;
  evolution_cost?: number | null;
  color?: string | null;
  color2?: string | null;
  rarity?: string | null;
  dp?: number | null;
  main_effect?: string | null;
  source_effect?: string | null;
  set_name?: string[] | string | null;
  form?: string | null;
};

const API_URL = "https://digimoncard.io/api-public/search?series=Digimon%20Card%20Game";
const USER_AGENT = "DigimonInventoryApp/1.0";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const CACHE_VERSION = 2;
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

    throw new Error(`DigimonCard.io returned ${response.status}`);
  }

  const rawCards = (await response.json()) as ApiCard[];
  const cardsByNumber = new Map<string, DigimonCard>();

  for (const rawCard of rawCards) {
    const card = normalizeCard(rawCard);
    if (!cardsByNumber.has(card.cardNumber)) {
      cardsByNumber.set(card.cardNumber, card);
    }
  }

  const cards = Array.from(cardsByNumber.values()).sort((a, b) => a.cardNumber.localeCompare(b.cardNumber));
  const cache = { cards, fetchedAt: now, version: CACHE_VERSION };

  memoryCache = cache;
  await writeDiskCache(cache);

  return cards;
}

function normalizeCard(card: ApiCard): DigimonCard {
  const colors = [card.color, card.color2].filter(Boolean) as string[];
  const setNames = Array.isArray(card.set_name) ? card.set_name : card.set_name ? [card.set_name] : [];
  const setName = setNames[0] ?? "";

  return {
    id: card.id,
    name: card.name,
    cardNumber: card.id,
    setCode: card.id.split("-")[0] ?? "",
    setName,
    color: colors.length > 0 ? colors : ["Colorless"],
    type: card.type,
    rarity: card.rarity ?? "Unknown",
    level: card.level ?? undefined,
    playCost: card.play_cost ?? undefined,
    digivolveCost: card.evolution_cost ?? undefined,
    dp: card.dp ?? undefined,
    imageUrl: `https://images.digimoncard.io/images/cards/${card.id}.webp`,
    effect: card.main_effect || card.source_effect || "",
    form: card.form ?? undefined,
  };
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
