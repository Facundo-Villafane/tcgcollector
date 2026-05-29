import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Archive, Eye, Heart } from "lucide-react";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: deckRow } = await supabase
    .from("decks")
    .select("id,user_id,name,description,cover_card_number,is_public,view_count,created_at,updated_at,deck_cards(card_number,quantity_required)")
    .eq("id", id)
    .single();

  if (!deckRow) notFound();
  if (!deckRow.is_public && deckRow.user_id !== user?.id) notFound();

  const isOwner = deckRow.user_id === user?.id;
  if (!isOwner) {
    await supabase.rpc("increment_deck_view", { deck_id_arg: id });
  }

  const [{ count: likeCount }, { data: latestRows }, cards] = await Promise.all([
    supabase.from("deck_likes").select("*", { count: "exact", head: true }).eq("deck_id", id),
    supabase
      .from("decks")
      .select("id,user_id,name,description,cover_card_number,is_public,view_count,created_at,updated_at,deck_cards(card_number,quantity_required)")
      .eq("is_public", true)
      .neq("id", id)
      .order("updated_at", { ascending: false })
      .limit(4),
    getDigimonCards(),
  ]);
  const cardsByNumber = getCardsByNumber(cards);
  const deck = fromDeckRow(deckRow as DeckRow);
  const cover = getDeckCover(deck, cardsByNumber);
  const groups = groupDeckCards(deck, cardsByNumber);
  const latestDecks = ((latestRows ?? []) as DeckRow[]).map(fromDeckRow);

  return (
    <main className="min-h-screen pb-10 text-[#1b2424]">
      <header className="skeuo-binder text-[#fff9ed]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-2" href="/">
            <span className="binder-stitch grid h-10 w-10 place-items-center rounded-md bg-[#f4c430] text-[#172b28]">
              <Archive size={22} />
            </span>
            <span>
              <span className="block text-lg font-bold leading-tight">Tamer Binder</span>
              <span className="block text-xs text-[#d7c9ae]">Decks públicos y colección</span>
            </span>
          </Link>
          <Link className="skeuo-button rounded-md px-3 py-2 text-sm font-semibold text-[#1b2424]" href={user ? "/?view=decks" : "/"}>
            {user ? "Mis decks" : "Entrar"}
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div
          className="card-sleeve overflow-hidden rounded-md bg-[#1b2424] p-5 text-white"
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
            <span className="flex items-center gap-1"><Eye size={16} /> {(deck.viewCount ?? 0) + (isOwner ? 0 : 1)} views</span>
            <span className="flex items-center gap-1"><Heart size={16} /> {likeCount ?? 0} likes</span>
            <span>{deck.isPublic ? "Público" : "Privado"}</span>
          </div>
        </div>

        <PublicDeckActions deck={deck} initialLikeCount={likeCount ?? 0} isOwner={isOwner} isAuthenticated={Boolean(user)} />

        {deck.description && (
          <div className="skeuo-card rounded-md p-4">
            <p>{deck.description}</p>
          </div>
        )}

        <div className="skeuo-card grid gap-5 rounded-md p-4 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h2 className="border-b binder-divider pb-2 font-bold">
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

        {latestDecks.length > 0 && (
          <section className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Latest Decks</h2>
              <Link className="text-sm font-semibold text-[#1d5fa8]" href="/">Ver todos</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {latestDecks.map((latestDeck) => {
                const latestCover = getDeckCover(latestDeck, cardsByNumber);
                return (
                  <Link
                    key={latestDeck.id}
                    className="card-sleeve relative min-h-40 overflow-hidden rounded-md bg-[#1b2424] p-4 text-white"
                    href={`/decks/${latestDeck.id}`}
                    style={{
                      backgroundImage: latestCover
                        ? `linear-gradient(180deg, rgba(20,28,32,0.2), rgba(20,28,32,0.92)), url(${latestCover.imageUrl})`
                        : "linear-gradient(135deg, #127d84, #1b2424)",
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }}
                  >
                    <span className="rounded bg-black/45 px-2 py-1 text-xs font-bold">{latestCover?.color[0] ?? "Deck"}</span>
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="truncate text-lg font-bold">{latestDeck.name}</h3>
                      <p className="text-xs text-white/80">{latestDeck.viewCount ?? 0} views</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
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

function getDeckCover(deck: Deck, cardsByNumber: Map<string, DigimonCard>) {
  if (deck.coverCardNumber) {
    const cover = cardsByNumber.get(normalizeCardNumber(deck.coverCardNumber));
    if (cover) return cover;
  }

  for (const deckCard of deck.cards) {
    const card = cardsByNumber.get(normalizeCardNumber(deckCard.cardNumber));
    if (card) return card;
  }

  return undefined;
}

function normalizeCardNumber(cardNumber: string) {
  return cardNumber.trim().toUpperCase().replace(/_P\d+$/, "");
}
