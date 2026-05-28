import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Eye, Heart } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getDigimonCards } from "@/lib/api/digimon-card-client";
import type { Deck, DigimonCard } from "@/lib/types";
import { PublicDeckActions } from "./PublicDeckActions";

type PageProps = {
  params: Promise<{ id: string }>;
};

type DeckRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_card_number: string | null;
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  deck_cards?: Array<{ card_number: string; quantity_required: number }>;
};

export default async function PublicDeckPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createClient(await cookies());

  const { data: deckRow } = await supabase
    .from("decks")
    .select("id,user_id,name,description,cover_card_number,is_public,view_count,created_at,updated_at,deck_cards(card_number,quantity_required)")
    .eq("id", id)
    .eq("is_public", true)
    .single();

  if (!deckRow) notFound();

  await supabase.rpc("increment_deck_view", { deck_id_arg: id });

  const [{ count: likeCount }, cards] = await Promise.all([
    supabase.from("deck_likes").select("*", { count: "exact", head: true }).eq("deck_id", id),
    getDigimonCards(),
  ]);
  const cardsByNumber = getCardsByNumber(cards);
  const deck = fromDeckRow(deckRow as DeckRow);
  const cover = deck.coverCardNumber ? cardsByNumber.get(normalizeCardNumber(deck.coverCardNumber)) : undefined;
  const groups = groupDeckCards(deck, cardsByNumber);

  return (
    <main className="min-h-screen bg-[#f7f7f2] px-4 py-6 text-[#1b2424]">
      <section className="mx-auto max-w-6xl space-y-5">
        <div
          className="overflow-hidden rounded-md border border-[#d9ded6] bg-[#1b2424] p-5 text-white shadow-sm"
          style={{
            backgroundImage: cover
              ? `linear-gradient(90deg, rgba(20,28,32,0.98), rgba(20,28,32,0.74), rgba(20,28,32,0.18)), url(${cover.imageUrl})`
              : "linear-gradient(135deg, #127d84, #1b2424)",
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        >
          <h1 className="text-3xl font-bold">{deck.name}</h1>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/85">
            <span className="flex items-center gap-1"><Eye size={16} /> {(deck.viewCount ?? 0) + 1} views</span>
            <span className="flex items-center gap-1"><Heart size={16} /> {likeCount ?? 0} likes</span>
          </div>
        </div>

        <PublicDeckActions deck={deck} initialLikeCount={likeCount ?? 0} />

        {deck.description && (
          <div className="rounded-md border border-[#d9ded6] bg-white p-4 shadow-sm">
            <p>{deck.description}</p>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2 rounded-md border border-[#d9ded6] bg-white p-4 shadow-sm">
              <h2 className="border-b border-[#c9d2cd] pb-2 font-bold">
                {group.title} ({group.items.reduce((sum, item) => sum + item.quantityRequired, 0)})
              </h2>
              {group.items.map((item) => (
                <div key={item.cardNumber} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 py-1 text-sm">
                  <span className="font-semibold text-[#1d5fa8]">{item.quantityRequired}</span>
                  <span className="truncate font-semibold">
                    {item.card?.name ?? item.cardNumber}
                    <span className="ml-1 text-[10px] font-normal text-[#60706d]">{item.cardNumber}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function fromDeckRow(row: DeckRow): Deck {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    coverCardNumber: row.cover_card_number ?? undefined,
    isPublic: row.is_public,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cards: (row.deck_cards ?? []).map((card) => ({
      cardNumber: card.card_number,
      cardId: card.card_number,
      quantityRequired: card.quantity_required,
    })),
  };
}

function groupDeckCards(deck: Deck, cardsByNumber: Map<string, DigimonCard>) {
  const groups = new Map<string, Array<{ cardNumber: string; quantityRequired: number; card?: DigimonCard }>>();

  for (const deckCard of deck.cards) {
    const card = cardsByNumber.get(normalizeCardNumber(deckCard.cardNumber));
    const title = card?.type === "Digi-Egg" ? "Egg Deck" : card?.type === "Option" ? "Option" : card?.type === "Tamer" ? "Tamer" : "Digimon";
    const items = groups.get(title) ?? [];
    items.push({ cardNumber: deckCard.cardNumber, quantityRequired: deckCard.quantityRequired, card });
    groups.set(title, items);
  }

  return ["Digimon", "Option", "Tamer", "Egg Deck"].map((title) => ({ title, items: groups.get(title) ?? [] })).filter((group) => group.items.length > 0);
}

function getCardsByNumber(cards: DigimonCard[]) {
  const map = new Map<string, DigimonCard>();
  for (const card of cards) {
    const key = normalizeCardNumber(card.cardNumber);
    const current = map.get(key);
    if (!current || card.parallelId < current.parallelId) map.set(key, card);
  }
  return map;
}

function normalizeCardNumber(cardNumber: string) {
  return cardNumber.trim().toUpperCase().replace(/_P\d+$/, "");
}
