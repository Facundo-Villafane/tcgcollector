import { NextResponse } from "next/server";
import { getDigimonCards } from "@/lib/api/digimon-card-client";

export async function GET() {
  try {
    const cards = await getDigimonCards();
    return NextResponse.json({ cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected card API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
