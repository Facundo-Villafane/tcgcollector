import { createClient } from "@supabase/supabase-js";
import type { CardPrice, CardPriceMap } from "@/lib/types";

type PriceRow = {
  card_number: string;
  source: string;
  market_price: number | string | null;
  low_price: number | string | null;
  currency: string;
  price_url: string | null;
  fetched_at: string;
};

type TcgApiSearchItem = Record<string, unknown>;

const priceCacheTtlMs = 24 * 60 * 60 * 1000;
const maxExternalFetchesPerRequest = 12;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const tcgApiDevKey = process.env.TCGAPI_DEV_KEY ?? process.env.TCGAPI_DOT_DEV_KEY ?? process.env.TCGAPI_KEY;
const tcgApiGameSlug = process.env.TCGAPI_GAME_SLUG ?? "digimon";

export async function getCardPrices(cardNumbers: string[], cardNamesByNumber: Record<string, string> = {}) {
  const uniqueCardNumbers = uniqueNormalized(cardNumbers).slice(0, 120);
  const cachedPrices = await readCachedPrices(uniqueCardNumbers);
  const staleOrMissing = uniqueCardNumbers.filter((cardNumber) => isStale(cachedPrices[cardNumber]));

  if (tcgApiDevKey && staleOrMissing.length > 0) {
    const freshPrices = await fetchExternalPrices(staleOrMissing.slice(0, maxExternalFetchesPerRequest), cardNamesByNumber);
    await writeCachedPrices(freshPrices);

    for (const price of freshPrices) {
      cachedPrices[price.cardNumber] = price;
    }
  }

  return {
    prices: cachedPrices,
    missing: uniqueCardNumbers.filter((cardNumber) => !cachedPrices[cardNumber]),
    sourceReady: Boolean(tcgApiDevKey),
  };
}

async function readCachedPrices(cardNumbers: string[]) {
  const prices: CardPriceMap = {};
  if (!supabaseUrl || !supabasePublishableKey || cardNumbers.length === 0) return prices;

  const supabase = createClient(supabaseUrl, supabasePublishableKey);
  const { data, error } = await supabase.from("card_prices").select("*").in("card_number", cardNumbers);
  if (error) return prices;

  for (const row of (data ?? []) as PriceRow[]) {
    prices[normalizeCardNumber(row.card_number)] = fromPriceRow(row);
  }

  return prices;
}

async function writeCachedPrices(prices: CardPrice[]) {
  if (!supabaseUrl || !supabaseServiceRoleKey || prices.length === 0) return;

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await supabase.from("card_prices").upsert(
    prices.map((price) => ({
      card_number: price.cardNumber,
      source: price.source,
      market_price: price.marketPrice,
      low_price: price.lowPrice ?? null,
      currency: price.currency,
      price_url: price.priceUrl ?? null,
      fetched_at: price.fetchedAt,
      updated_at: new Date().toISOString(),
    })),
  );
}

async function fetchExternalPrices(cardNumbers: string[], cardNamesByNumber: Record<string, string>) {
  const prices: CardPrice[] = [];

  for (const cardNumber of cardNumbers) {
    const price = await fetchTcgApiDevPrice(cardNumber, cardNamesByNumber[normalizeCardNumber(cardNumber)]);
    if (price) prices.push(price);
  }

  return prices;
}

async function fetchTcgApiDevPrice(cardNumber: string, cardName?: string): Promise<CardPrice | null> {
  if (!tcgApiDevKey) return null;

  const query = cardName ?? cardNumber;

  const url = new URL("https://api.tcgapi.dev/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("game", tcgApiGameSlug);
  url.searchParams.set("type", "Cards");
  url.searchParams.set("per_page", "200");

  const response = await fetch(url, {
    headers: { "X-API-Key": tcgApiDevKey, Authorization: `Bearer ${tcgApiDevKey}` },
    next: { revalidate: 60 * 60 },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { data?: TcgApiSearchItem[] };
  const item = findBestTcgApiDevItem(payload.data ?? [], cardNumber);
  if (!item) return null;

  const marketPrice = readNumber(item, ["price", "market_price", "marketPrice", "tcgplayer_market_price", "tcgplayerMarketPrice"]);
  const lowPrice = readNumber(item, ["low_price", "lowPrice", "min_price", "minPrice"]);
  if (marketPrice === null && lowPrice === null) return null;

  return {
    cardNumber,
    source: "tcgapi.dev",
    marketPrice: marketPrice ?? lowPrice,
    lowPrice,
    currency: readString(item, ["currency"]) ?? "USD",
    priceUrl: readString(item, ["url", "product_url", "productUrl", "tcgplayer_url", "tcgplayerUrl"]),
    fetchedAt: new Date().toISOString(),
  };
}

function findBestTcgApiDevItem(items: TcgApiSearchItem[], cardNumber: string) {
  const normalized = normalizeCardNumber(cardNumber);
  return (
    items.find((item) => normalizeCardNumber(readString(item, ["number"]) ?? "") === normalized) ??
    items.find((item) => normalizeCardNumber(readString(item, ["number"]) ?? "").startsWith(normalized)) ??
    null
  );
}

function readNumber(item: TcgApiSearchItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function readString(item: TcgApiSearchItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  return null;
}

function fromPriceRow(row: PriceRow): CardPrice {
  return {
    cardNumber: normalizeCardNumber(row.card_number),
    source: row.source,
    marketPrice: row.market_price === null ? null : Number(row.market_price),
    lowPrice: row.low_price === null ? null : Number(row.low_price),
    currency: row.currency,
    priceUrl: row.price_url,
    fetchedAt: row.fetched_at,
  };
}

function isStale(price: CardPrice | undefined) {
  if (!price) return true;
  return Date.now() - new Date(price.fetchedAt).getTime() > priceCacheTtlMs;
}

function uniqueNormalized(values: string[]) {
  return Array.from(new Set(values.map(normalizeCardNumber).filter(Boolean)));
}

function normalizeCardNumber(cardNumber: string) {
  return cardNumber.trim().toUpperCase().replace(/_P\d+$/, "").replace(/-P\d+$/, "");
}
