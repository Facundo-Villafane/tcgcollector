"use client";

import { Heart, Copy, LogIn } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Deck } from "@/lib/types";

export function PublicDeckActions({ deck, initialLikeCount }: { deck: Deck; initialLikeCount: number }) {
  const supabase = createClient();
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liked, setLiked] = useState(false);
  const [status, setStatus] = useState("");

  async function requireUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  }

  async function copyDeck() {
    const user = await requireUser();
    if (!user) {
      setStatus("Iniciá sesión para copiar este deck.");
      return;
    }

    const now = new Date().toISOString();
    const newDeckId = crypto.randomUUID();
    const { error: deckError } = await supabase.from("decks").insert({
      id: newDeckId,
      user_id: user.id,
      name: `${deck.name} copy`,
      description: deck.description ?? null,
      cover_card_number: deck.coverCardNumber ?? null,
      is_public: false,
      created_at: now,
      updated_at: now,
    });

    if (deckError) {
      setStatus("No se pudo copiar el deck.");
      return;
    }

    if (deck.cards.length > 0) {
      const { error: cardsError } = await supabase.from("deck_cards").insert(
        deck.cards.map((card) => ({
          deck_id: newDeckId,
          card_number: card.cardNumber,
          quantity_required: card.quantityRequired,
        })),
      );

      if (cardsError) {
        setStatus("El deck se creó, pero falló copiar cartas.");
        return;
      }
    }

    setStatus("Deck copiado a tu perfil.");
  }

  async function toggleLike() {
    const user = await requireUser();
    if (!user) {
      setStatus("Iniciá sesión para dar like.");
      return;
    }

    if (liked) {
      const { error } = await supabase.from("deck_likes").delete().eq("deck_id", deck.id).eq("user_id", user.id);
      if (!error) {
        setLiked(false);
        setLikeCount((count) => Math.max(count - 1, 0));
      }
      return;
    }

    const { error } = await supabase.from("deck_likes").insert({ deck_id: deck.id, user_id: user.id });
    if (!error) {
      setLiked(true);
      setLikeCount((count) => count + 1);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="flex items-center gap-2 rounded-md bg-[#127d84] px-4 py-2 font-semibold text-white" onClick={copyDeck}>
        <Copy size={17} />
        Copiar a mis decks
      </button>
      <button className="flex items-center gap-2 rounded-md border border-[#c9d2cd] bg-white px-4 py-2 font-semibold" onClick={toggleLike}>
        <Heart size={17} fill={liked ? "#d9534f" : "none"} />
        {likeCount}
      </button>
      {status && (
        <span className="flex items-center gap-1 text-sm text-[#60706d]">
          <LogIn size={14} />
          {status}
        </span>
      )}
    </div>
  );
}
