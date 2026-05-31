import { NextRequest, NextResponse } from "next/server";
import { getCardPrices } from "@/lib/api/price-client";
import { getDigimonCards } from "@/lib/api/digimon-card-client";

export async function GET(request: NextRequest) {
  const cardNumbers = request.nextUrl.searchParams
    .get("cards")
    ?.split(",")
    .map((cardNumber) => cardNumber.trim())
    .filter(Boolean);

  if (!cardNumbers?.length) {
    return NextResponse.json({ prices: {}, missing: [], sourceReady: hasPriceSource() });
  }

  try {
    const cards = await getDigimonCards();
    const payload = await getCardPrices(cardNumbers, getCardNamesByNumber(cards));
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected price API error";
    if (message === "TCGAPI_RATE_LIMIT") {
      return NextResponse.json(
        { error: "Límite diario de tcgapi.dev agotado. Vuelve a intentar después del reset diario.", prices: {}, missing: cardNumbers },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: message, prices: {}, missing: cardNumbers }, { status: 502 });
  }
}

function hasPriceSource() {
  return Boolean(process.env.TCGAPI_DEV_KEY ?? process.env.TCGAPI_DOT_DEV_KEY ?? process.env.TCGAPI_KEY);
}

function getCardNamesByNumber(cards: Awaited<ReturnType<typeof getDigimonCards>>) {
  return Object.fromEntries(cards.map((card) => [normalizeCardNumber(card.cardNumber), card.name]));
}

function normalizeCardNumber(cardNumber: string) {
  return cardNumber.trim().toUpperCase().replace(/_P\d+$/, "").replace(/-P\d+$/, "");
}
