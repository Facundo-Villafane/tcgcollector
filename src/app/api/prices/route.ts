import { NextRequest, NextResponse } from "next/server";
import { getCardPrices } from "@/lib/api/price-client";

export async function GET(request: NextRequest) {
  const cardNumbers = request.nextUrl.searchParams
    .get("cards")
    ?.split(",")
    .map((cardNumber) => cardNumber.trim())
    .filter(Boolean);

  if (!cardNumbers?.length) {
    return NextResponse.json({ prices: {}, missing: [], sourceReady: Boolean(process.env.TCGAPI_KEY) });
  }

  try {
    const payload = await getCardPrices(cardNumbers);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected price API error";
    return NextResponse.json({ error: message, prices: {}, missing: cardNumbers }, { status: 502 });
  }
}
