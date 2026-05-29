"use client";

import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crown,
  Eye,
  Images,
  Library,
  List,
  Minus,
  Pencil,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { CollectionMap, Deck, DigimonCard, UserProfile } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";

type View = "dashboard" | "catalog" | "collection" | "decks";
type DeckMode = "view" | "edit";

const STORAGE_KEYS = {
  collection: "tamer-binder:collection",
  decks: "tamer-binder:decks",
};

const maxDeckQuantity = 4;
const quantityOptions = Array.from({ length: maxDeckQuantity + 1 }, (_value, index) => index);

type DeckImportResult = {
  importedLines: number;
  importedCopies: number;
  notFound: string[];
  ignored: string[];
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
  deck_cards?: Array<{
    card_number: string;
    quantity_required: number;
  }>;
};

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [cards, setCards] = useState<DigimonCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Guardado local");
  const [hasLoadedRemoteData, setHasLoadedRemoteData] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState("All");
  const [type, setType] = useState("All");
  const [setCode, setSetCode] = useState("All");
  const [collection, setCollection] = useState<CollectionMap>({});
  const [decks, setDecks] = useState<Deck[]>([]);
  const [publicDecks, setPublicDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState("");
  const [deckMode, setDeckMode] = useState<DeckMode>("view");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [selectedCard, setSelectedCard] = useState<DigimonCard | null>(null);
  const [selectedCardOwnedOverride, setSelectedCardOwnedOverride] = useState<number | null>(null);
  const [showDeckImages, setShowDeckImages] = useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      const savedCollection = readStorage<CollectionMap>(STORAGE_KEYS.collection, {});
      const savedDecks = readStorage<Deck[]>(STORAGE_KEYS.decks, []);
      setCollection(savedCollection);
      setDecks(savedDecks);
      setActiveDeckId(savedDecks[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.user ? toUserProfile(data.user) : null);
      setHasLoadedRemoteData(false);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toUserProfile(session.user) : null);
      setHasLoadedRemoteData(false);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    async function loadCards() {
      try {
        const response = await fetch("/api/cards");
        const payload = (await response.json()) as { cards?: DigimonCard[]; error?: string };
        if (!response.ok || !payload.cards) {
          throw new Error(payload.error ?? "No se pudo cargar el catálogo.");
        }
        setCards(payload.cards);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el catálogo.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCards();
  }, []);

  useEffect(() => {
    async function loadPublicDecks() {
      const { data } = await supabase
        .from("decks")
        .select("id,user_id,name,description,cover_card_number,is_public,view_count,created_at,updated_at,deck_cards(card_number,quantity_required)")
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(8);

      setPublicDecks(((data ?? []) as DeckRow[]).map(fromDeckRow));
    }

    loadPublicDecks();
  }, [supabase]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.collection, collection);
  }, [collection]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.decks, decks);
  }, [decks]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const requestedDeckId = params.get("deck");

    queueMicrotask(() => {
      if (requestedView === "decks") {
        setView("decks");
      }

      if (requestedDeckId && decks.some((deck) => deck.id === requestedDeckId)) {
        setActiveDeckId(requestedDeckId);
        setDeckMode("view");
      }
    });
  }, [decks]);

  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const cardsByNumber = useMemo(() => getRegularCardsByNumber(cards), [cards]);
  const collectionCards = useMemo(
    () => cards.filter((card) => (collection[card.id] ?? 0) > 0),
    [cards, collection],
  );

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return cards
      .filter((card) => {
        const matchesQuery =
          normalizedQuery.length === 0 ||
          card.name.toLowerCase().includes(normalizedQuery) ||
          card.cardNumber.toLowerCase().includes(normalizedQuery) ||
          card.setName.toLowerCase().includes(normalizedQuery) ||
          card.setCode.toLowerCase().includes(normalizedQuery);
        const matchesColor = color === "All" || card.color.includes(color);
        const matchesType = type === "All" || card.type === type;
        const matchesSet = setCode === "All" || card.setCode === setCode;

        return matchesQuery && matchesColor && matchesType && matchesSet;
      })
      .slice(0, 80);
  }, [cards, color, query, setCode, type]);

  const colors = useMemo(() => unique(cards.flatMap((card) => card.color)).sort(), [cards]);
  const types = useMemo(() => unique(cards.map((card) => card.type)).sort(), [cards]);
  const sets = useMemo(() => unique(cards.map((card) => card.setCode)).sort(), [cards]);
  const activeDeck = decks.find((deck) => deck.id === activeDeckId) ?? decks[0];
  const ownedByCardNumber = useMemo(() => getOwnedByCardNumber(collection, cardsById), [collection, cardsById]);
  const deckStats = useMemo(
    () => decks.map((deck) => getDeckStats(deck, ownedByCardNumber, cardsByNumber)),
    [decks, ownedByCardNumber, cardsByNumber],
  );
  const activeDeckCards = useMemo(
    () => splitDeckCards(activeDeck, cardsByNumber),
    [activeDeck, cardsByNumber],
  );
  const totalMissingCopies = deckStats.reduce((sum, stat) => sum + stat.missingCopies, 0);
  const ownedCopies = Object.values(collection).reduce((sum, quantity) => sum + quantity, 0);

  async function handleGoogleLogin() {
    setAuthError("");
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (loginError) {
      setAuthError(loginError.message);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setHasLoadedRemoteData(false);
  }

  async function loadRemoteUserData(userId: string) {
    setSaveStatus("Cargando Supabase...");

    const [{ data: collectionRows, error: collectionError }, { data: deckRows, error: deckError }] = await Promise.all([
      supabase.from("user_collection").select("card_id, quantity").eq("user_id", userId),
      supabase
        .from("decks")
        .select("id,user_id,name,description,cover_card_number,is_public,view_count,created_at,updated_at,deck_cards(card_number,quantity_required)")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
    ]);

    if (collectionError || deckError) {
      setSaveStatus("Guardado local: falta configurar Supabase");
      setHasLoadedRemoteData(false);
      return;
    }

    const remoteCollection = Object.fromEntries(
      (collectionRows ?? []).map((row) => [String(row.card_id), Number(row.quantity)]),
    );
    const remoteDecks = ((deckRows ?? []) as DeckRow[]).map(fromDeckRow);

    if (Object.keys(remoteCollection).length === 0 && remoteDecks.length === 0 && (Object.keys(collection).length > 0 || decks.length > 0)) {
      setHasLoadedRemoteData(true);
      setSaveStatus("Migrando datos locales...");
      await syncCollection(userId, collection);
      await syncDecks(userId, decks);
      return;
    }

    setCollection(remoteCollection);
    setDecks(remoteDecks);
    setActiveDeckId(remoteDecks[0]?.id ?? "");
    setHasLoadedRemoteData(true);
    setSaveStatus("Sincronizado");
  }

  async function syncCollection(userId: string, nextCollection: CollectionMap) {
    setSaveStatus("Guardando colección...");

    const entries = Object.entries(nextCollection).filter(([, quantity]) => quantity > 0);
    const { error: deleteError } = await supabase.from("user_collection").delete().eq("user_id", userId);

    if (deleteError) {
      setSaveStatus("No se pudo guardar colección");
      return;
    }

    if (entries.length > 0) {
      const { error: insertError } = await supabase.from("user_collection").insert(
        entries.map(([cardId, quantity]) => ({
          user_id: userId,
          card_id: cardId,
          quantity,
        })),
      );

      if (insertError) {
        setSaveStatus("No se pudo guardar colección");
        return;
      }
    }

    setSaveStatus("Sincronizado");
  }

  async function syncDecks(userId: string, nextDecks: Deck[]) {
    setSaveStatus("Guardando decks...");

    const deckIds = nextDecks.map((deck) => deck.id);
    const { data: remoteDecks, error: remoteError } = await supabase.from("decks").select("id").eq("user_id", userId);

    if (remoteError) {
      setSaveStatus("No se pudieron guardar decks");
      return;
    }

    const removedIds = (remoteDecks ?? []).map((deck) => deck.id).filter((id) => !deckIds.includes(id));
    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase.from("decks").delete().in("id", removedIds);
      if (deleteError) {
        setSaveStatus("No se pudieron guardar decks");
        return;
      }
    }

    if (nextDecks.length === 0) {
      setSaveStatus("Sincronizado");
      return;
    }

    const { error: upsertError } = await supabase.from("decks").upsert(
      nextDecks.map((deck) => ({
        id: deck.id,
        user_id: userId,
        name: deck.name,
        description: deck.description ?? null,
        cover_card_number: deck.coverCardNumber ?? null,
        is_public: deck.isPublic ?? true,
        view_count: deck.viewCount ?? 0,
        created_at: deck.createdAt,
        updated_at: deck.updatedAt,
      })),
    );

    if (upsertError) {
      setSaveStatus("No se pudieron guardar decks");
      return;
    }

    for (const deck of nextDecks) {
      const { error: deleteCardsError } = await supabase.from("deck_cards").delete().eq("deck_id", deck.id);
      if (deleteCardsError) {
        setSaveStatus("No se pudieron guardar cartas del deck");
        return;
      }

      if (deck.cards.length > 0) {
        const { error: insertCardsError } = await supabase.from("deck_cards").insert(
          deck.cards.map((deckCard) => ({
            deck_id: deck.id,
            card_number: deckCard.cardNumber ?? deckCard.cardId,
            quantity_required: deckCard.quantityRequired,
          })),
        );

        if (insertCardsError) {
          setSaveStatus("No se pudieron guardar cartas del deck");
          return;
        }
      }
    }

    setSaveStatus("Sincronizado");
  }

  useEffect(() => {
    if (!user) return;

    queueMicrotask(() => {
      loadRemoteUserData(user.id);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !hasLoadedRemoteData) return;

    const timeoutId = window.setTimeout(() => {
      syncCollection(user.id, collection);
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [collection, hasLoadedRemoteData, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !hasLoadedRemoteData) return;

    const timeoutId = window.setTimeout(() => {
      syncDecks(user.id, decks);
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [decks, hasLoadedRemoteData, user]); // eslint-disable-line react-hooks/exhaustive-deps

  function setOwnedQuantity(cardId: string, quantity: number) {
    setCollection((current) => {
      const next = { ...current };
      if (quantity <= 0) {
        delete next[cardId];
      } else {
        next[cardId] = quantity;
      }
      return next;
    });
  }

  function createDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const name = newDeckName.trim();
    if (!name) return;

    const now = new Date().toISOString();
    const deck: Deck = {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      isPublic: true,
      createdAt: now,
      updatedAt: now,
      cards: [],
    };

    setDecks((current) => [deck, ...current]);
    setActiveDeckId(deck.id);
    setDeckMode("edit");
    setIsCreatingDeck(false);
    setNewDeckName("");
    setView("decks");
  }

  function setDeckQuantity(deckId: string, cardNumber: string, quantityRequired: number) {
    setDecks((current) =>
      current.map((deck) => {
        if (deck.id !== deckId) return deck;

        const normalizedCardNumber = normalizeCardNumber(cardNumber);
        const existing = deck.cards.find(
          (deckCard) => normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) === normalizedCardNumber,
        );
        const nextCards =
          quantityRequired <= 0
            ? deck.cards.filter(
                (deckCard) => normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) !== normalizedCardNumber,
              )
            : existing
              ? deck.cards.map((deckCard) =>
                  normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) === normalizedCardNumber
                    ? { ...deckCard, cardNumber, cardId: cardNumber, quantityRequired }
                    : deckCard,
                )
              : [...deck.cards, { cardNumber, cardId: cardNumber, quantityRequired }];

        return { ...deck, cards: nextCards, updatedAt: new Date().toISOString() };
      }),
    );
  }

  function importDeckList(deckId: string, text: string): DeckImportResult {
    const parsed = parseDeckList(text, cardsByNumber);

    if (parsed.cards.length > 0) {
      setDecks((current) =>
        current.map((deck) => {
          if (deck.id !== deckId) return deck;

          const quantities = new Map(
            deck.cards.map((deckCard) => [deckCard.cardNumber ?? deckCard.cardId, deckCard.quantityRequired]),
          );

          for (const deckCard of parsed.cards) {
            quantities.set(deckCard.cardNumber, deckCard.quantityRequired);
          }

          return {
            ...deck,
            cards: Array.from(quantities.entries()).map(([cardNumber, quantityRequired]) => ({
              cardNumber,
              cardId: cardNumber,
              quantityRequired,
            })),
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    }

    return {
      importedLines: parsed.cards.length,
      importedCopies: parsed.cards.reduce((sum, deckCard) => sum + deckCard.quantityRequired, 0),
      notFound: parsed.notFound,
      ignored: parsed.ignored,
    };
  }

  function deleteDeck(deckId: string) {
    setDecks((current) => current.filter((deck) => deck.id !== deckId));
    if (activeDeckId === deckId) {
      setActiveDeckId(decks.find((deck) => deck.id !== deckId)?.id ?? "");
    }
  }

  function updateDeckDetails(deckId: string, details: Partial<Pick<Deck, "description" | "coverCardNumber" | "isPublic">>) {
    setDecks((current) =>
      current.map((deck) =>
        deck.id === deckId ? { ...deck, ...details, updatedAt: new Date().toISOString() } : deck,
      ),
    );
  }

  if (isAuthLoading) {
    return <EmptyPage title="Cargando sesión" detail="Estamos revisando tu login de Supabase." />;
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="skeuo-binder sticky top-0 z-20 text-[#fff9ed] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button className="flex items-center gap-2 text-left" onClick={() => setView("dashboard")}>
            <span className="binder-stitch grid h-10 w-10 place-items-center rounded-md bg-[#f4c430] text-[#172b28]">
              <Archive size={22} />
            </span>
            <span>
              <span className="block text-lg font-bold leading-tight">Tamer Binder</span>
              <span className="block text-xs text-[#d7c9ae]">
                {user ? `${user.displayName} · ${saveStatus}` : "Explorá decks públicos"}
              </span>
            </span>
          </button>
          {user ? (
          <button
            className="skeuo-button grid h-10 w-10 place-items-center rounded-md text-[#1b2424]"
            title="Cerrar sesión"
            onClick={handleLogout}
          >
            <UserIcon size={18} />
          </button>
          ) : (
            <button className="skeuo-primary rounded-md px-3 py-2 text-sm font-semibold text-white" onClick={handleGoogleLogin}>
              Entrar
            </button>
          )}
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
          <NavButton icon={<ShieldCheck size={17} />} label="Inicio" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <NavButton icon={<Search size={17} />} label="Cartas" active={view === "catalog"} onClick={() => setView("catalog")} />
          <NavButton icon={<Library size={17} />} label="Colección" active={view === "collection"} onClick={() => user ? setView("collection") : handleGoogleLogin()} />
          <NavButton icon={<BookOpen size={17} />} label="Decks" active={view === "decks"} onClick={() => user ? setView("decks") : handleGoogleLogin()} />
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {view === "dashboard" && (
          <section className="skeuo-shell space-y-6 rounded-md p-4 sm:p-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#127d84]">Digimon Card Game</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Colección, decks y comunidad.</h1>
            </div>

            {user && <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Cartas registradas" value={collectionCards.length.toString()} detail={`${ownedCopies} copias`} />
              <Metric label="Mis decks" value={decks.length.toString()} detail="listas creadas" />
              <Metric label="Copias faltantes" value={totalMissingCopies.toString()} detail="para completar decks" />
            </div>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionButton icon={<Search size={20} />} label="Buscar cartas" onClick={() => setView("catalog")} />
              <ActionButton icon={<Library size={20} />} label="Mi colección" onClick={() => user ? setView("collection") : handleGoogleLogin()} />
              <ActionButton icon={<BookOpen size={20} />} label="Mis decks" onClick={() => user ? setView("decks") : handleGoogleLogin()} />
              {!user && <ActionButton icon={<UserIcon size={20} />} label="Entrar" onClick={handleGoogleLogin} />}
            </div>

            {authError && <p className="text-sm font-semibold text-[#d9534f]">{authError}</p>}

            <LatestDecks decks={publicDecks} cardsByNumber={cardsByNumber} />
              {user && <DeckSummary decks={decks} stats={deckStats} onOpen={(id) => { setActiveDeckId(id); setView("decks"); }} />}
          </section>
        )}

        {(view === "catalog" || view === "collection") && (
          <section className="skeuo-shell space-y-4 rounded-md p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="skeuo-shell rounded-md p-4">
                <h1 className="text-2xl font-bold">{view === "catalog" ? "Buscar cartas" : "Mi colección"}</h1>
                <p className="text-sm text-[#60706d]">
                  {view === "catalog" ? `${cards.length} cartas del catálogo global` : `${collectionCards.length} cartas con copias registradas`}
                </p>
              </div>
              <Filters
                query={query}
                setQuery={setQuery}
                color={color}
                setColor={setColor}
                type={type}
                setType={setType}
                setCode={setCode}
                setSetCode={setSetCode}
                colors={colors}
                types={types}
                sets={sets}
              />
            </div>

            {isLoading && <EmptyState title="Cargando catálogo" detail="La primera carga puede tardar un momento." />}
            {error && <EmptyState title="No se pudo cargar" detail={error} />}
            {!isLoading && !error && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(view === "catalog" ? filteredCards : filteredCards.filter((card) => (collection[card.id] ?? 0) > 0)).map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    owned={collection[card.id] ?? 0}
                    onOpen={() => {
                      setSelectedCardOwnedOverride(null);
                      setSelectedCard(card);
                    }}
                    onSetOwned={(quantity) => setOwnedQuantity(card.id, quantity)}
                    onAddToDeck={
                      activeDeck
                        ? () => {
                            setDeckQuantity(activeDeck.id, card.cardNumber, 1);
                            setView("decks");
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {view === "decks" && (
          <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold">Mis decks</h1>
                <p className="text-sm text-[#60706d]">Construí listas y revisá faltantes.</p>
              </div>
              {isCreatingDeck ? (
                <form className="skeuo-card rounded-md p-3" onSubmit={createDeck}>
                  <label className="text-sm font-semibold" htmlFor="deck-name">
                    Nuevo deck
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="deck-name"
                      className="min-w-0 flex-1 rounded-md border border-[#c9d2cd] px-3 py-2 outline-none focus:border-[#127d84]"
                      value={newDeckName}
                      onChange={(event) => setNewDeckName(event.target.value)}
                      placeholder="Red Greymon"
                    />
                    <button className="skeuo-primary grid h-10 w-10 place-items-center rounded-md text-white" title="Crear deck">
                      <Plus size={18} />
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="skeuo-button flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 font-semibold"
                  onClick={() => setIsCreatingDeck(true)}
                >
                  <Plus size={17} />
                  Nuevo deck
                </button>
              )}

              <div className="space-y-2">
                {decks.length === 0 && <EmptyState title="Sin decks" detail="Creá tu primer deck para comparar con tu colección." />}
                {decks.map((deck) => {
                  const stats = getDeckStats(deck, ownedByCardNumber, cardsByNumber);
                  return (
                    <button
                      key={deck.id}
                      className={`w-full rounded-md border p-3 text-left shadow-sm ${
                        activeDeck?.id === deck.id ? "border-[#127d84] bg-[#e9f5f3]" : "border-[#d9ded6] bg-white"
                      }`}
                      onClick={() => {
                        setActiveDeckId(deck.id);
                        setDeckMode("view");
                      }}
                    >
                      <span className="block font-semibold">{deck.name}</span>
                      <span className="mt-1 block text-sm text-[#60706d]">
                        {stats.totalCards} cartas · {stats.missingCopies === 0 ? "Completo" : `${stats.missingCopies} copias faltantes`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="space-y-4">
              {activeDeck ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="skeuo-card flex rounded-md p-1">
                      <button
                        className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${deckMode === "view" ? "bg-[#127d84] text-white" : "text-[#60706d]"}`}
                        onClick={() => setDeckMode("view")}
                      >
                        <Eye size={16} />
                        Vista
                      </button>
                      <button
                        className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${deckMode === "edit" ? "bg-[#127d84] text-white" : "text-[#60706d]"}`}
                        onClick={() => setDeckMode("edit")}
                      >
                        <Pencil size={16} />
                        Editar
                      </button>
                    </div>
                    {deckMode === "view" && (
                      <p className="text-sm text-[#60706d]">Modo solo lectura. Entrá a editar para modificar este deck.</p>
                    )}
                  </div>
                  <DeckEditorHeader
                    deck={activeDeck}
                    coverCard={getDeckCoverCard(activeDeck, activeDeckCards.all, cardsByNumber)}
                    stats={getDeckStats(activeDeck, ownedByCardNumber, cardsByNumber)}
                    isEditing={deckMode === "edit"}
                    onDescriptionChange={(description) => updateDeckDetails(activeDeck.id, { description })}
                    onPublicChange={(isPublic) => updateDeckDetails(activeDeck.id, { isPublic })}
                    onDelete={() => deleteDeck(activeDeck.id)}
                  />
                  {deckMode === "edit" && (
                    <>
                      <DeckImportPanel onImport={(text) => importDeckList(activeDeck.id, text)} disabled={cards.length === 0} />
                      <Filters
                        query={query}
                        setQuery={setQuery}
                        color={color}
                        setColor={setColor}
                        type={type}
                        setType={setType}
                        setCode={setCode}
                        setSetCode={setSetCode}
                        colors={colors}
                        types={types}
                        sets={sets}
                      />
                    </>
                  )}
                  <div className="grid gap-3">
                    {activeDeck.cards.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h2 className="text-sm font-bold uppercase tracking-wide text-[#60706d]">Cartas del deck</h2>
                          <button
                            className="flex w-fit items-center gap-2 rounded-md border border-[#c9d2cd] bg-white px-3 py-2 text-sm font-semibold"
                            onClick={() => setShowDeckImages((current) => !current)}
                          >
                            {showDeckImages ? <List size={16} /> : <Images size={16} />}
                            {showDeckImages ? "Vista compacta" : "Ver mini cartas"}
                          </button>
                        </div>
                        {showDeckImages ? (
                          <>
                            <DeckSection
                              title={`Main Deck (${activeDeckCards.mainCount})`}
                              items={activeDeckCards.main}
                              ownedByCardNumber={ownedByCardNumber}
                              onChange={(cardNumber, quantity) => setDeckQuantity(activeDeck.id, cardNumber, quantity)}
                              onOpen={(card) => {
                                setSelectedCardOwnedOverride(ownedByCardNumber[normalizeCardNumber(card.cardNumber)] ?? 0);
                                setSelectedCard(card);
                              }}
                              coverCardNumber={activeDeck.coverCardNumber}
                              isEditing={deckMode === "edit"}
                              onSetCover={(cardNumber) => updateDeckDetails(activeDeck.id, { coverCardNumber: cardNumber })}
                            />
                            <DeckSection
                              title={`Digi-Egg Deck (${activeDeckCards.eggCount})`}
                              items={activeDeckCards.eggs}
                              ownedByCardNumber={ownedByCardNumber}
                              onChange={(cardNumber, quantity) => setDeckQuantity(activeDeck.id, cardNumber, quantity)}
                              onOpen={(card) => {
                                setSelectedCardOwnedOverride(ownedByCardNumber[normalizeCardNumber(card.cardNumber)] ?? 0);
                                setSelectedCard(card);
                              }}
                              coverCardNumber={activeDeck.coverCardNumber}
                              isEditing={deckMode === "edit"}
                              onSetCover={(cardNumber) => updateDeckDetails(activeDeck.id, { coverCardNumber: cardNumber })}
                            />
                          </>
                        ) : (
                          <CompactDeckList
                            groups={activeDeckCards.groups}
                            ownedByCardNumber={ownedByCardNumber}
                            coverCardNumber={activeDeck.coverCardNumber}
                            isEditing={deckMode === "edit"}
                            onOpen={(card) => {
                              setSelectedCardOwnedOverride(ownedByCardNumber[normalizeCardNumber(card.cardNumber)] ?? 0);
                              setSelectedCard(card);
                            }}
                            onSetCover={(cardNumber) => updateDeckDetails(activeDeck.id, { coverCardNumber: cardNumber })}
                          />
                        )}
                      </div>
                    )}

                    {deckMode === "edit" && <div className="space-y-2">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-[#60706d]">Agregar cartas</h2>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {filteredCards.filter((card) => !card.isAlternateArt).slice(0, 20).map((card) => {
                          const required =
                            activeDeck.cards.find((deckCard) => (deckCard.cardNumber ?? deckCard.cardId) === card.cardNumber)
                              ?.quantityRequired ?? 0;
                          return (
                            <AddDeckCardTile
                              key={card.id}
                              card={card}
                              required={required}
                              owned={ownedByCardNumber[normalizeCardNumber(card.cardNumber)] ?? 0}
                              onChange={(quantity) => setDeckQuantity(activeDeck.id, card.cardNumber, quantity)}
                            />
                          );
                        })}
                      </div>
                    </div>}
                  </div>
                </>
              ) : (
                <EmptyState title="Elegí o creá un deck" detail="Después podés agregar cartas y ver faltantes al instante." />
              )}
            </div>
          </section>
        )}
      </div>

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          owned={selectedCardOwnedOverride ?? collection[selectedCard.id] ?? 0}
          onClose={() => {
            setSelectedCard(null);
            setSelectedCardOwnedOverride(null);
          }}
          onSetOwned={(quantity) => {
            if (selectedCardOwnedOverride === null) {
              setOwnedQuantity(selectedCard.id, quantity);
            }
          }}
        />
      )}
    </main>
  );
}

function EmptyPage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <EmptyState title={title} detail={detail} />
    </main>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
        active ? "skeuo-primary text-white" : "skeuo-button text-[#1b2424]"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="skeuo-card rounded-md p-4">
      <p className="text-sm text-[#60706d]">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="text-sm text-[#60706d]">{detail}</p>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="skeuo-button flex items-center justify-between rounded-md p-3 text-sm font-semibold" onClick={onClick}>
      <span className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#f4c430] text-[#1b2424] shadow-inner">{icon}</span>
        {label}
      </span>
      <ChevronRight size={18} />
    </button>
  );
}

function LatestDecks({ decks, cardsByNumber }: { decks: Deck[]; cardsByNumber: Map<string, DigimonCard> }) {
  if (decks.length === 0) {
    return <EmptyState title="Todavía no hay decks públicos" detail="Cuando alguien publique un deck, va a aparecer acá." />;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Latest Decks</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {decks.map((deck) => {
          const cover = getDeckCoverCard(deck, splitDeckCards(deck, cardsByNumber).all, cardsByNumber);
          return (
            <a
              key={deck.id}
              className="card-sleeve relative min-h-44 overflow-hidden rounded-md bg-[#1b2424] p-4 text-white"
              href={`/decks/${deck.id}`}
              style={{
                backgroundImage: cover
                  ? `linear-gradient(180deg, rgba(20,28,32,0.22), rgba(20,28,32,0.92)), url(${cover.imageUrl})`
                  : "linear-gradient(135deg, #127d84, #1b2424)",
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            >
              <span className="rounded bg-black/55 px-2 py-1 text-xs font-bold shadow-sm">{cover?.color[0] ?? "Deck"}</span>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="truncate text-lg font-bold">{deck.name}</h3>
                <p className="text-xs text-white/80">{deck.viewCount ?? 0} views</p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function Filters(props: {
  query: string;
  setQuery: (value: string) => void;
  color: string;
  setColor: (value: string) => void;
  type: string;
  setType: (value: string) => void;
  setCode: string;
  setSetCode: (value: string) => void;
  colors: string[];
  types: string[];
  sets: string[];
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_130px_140px_130px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#60706d]" size={17} />
        <input
          className="h-10 w-full rounded-md border border-[#c9d2cd] bg-white pl-9 pr-3 outline-none focus:border-[#127d84]"
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder="Agumon, BT1-010, set..."
        />
      </div>
      <Select value={props.color} onChange={props.setColor} options={["All", ...props.colors]} />
      <Select value={props.type} onChange={props.setType} options={["All", ...props.types]} />
      <Select value={props.setCode} onChange={props.setSetCode} options={["All", ...props.sets]} />
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select className="h-10 rounded-md border border-[#c9d2cd] bg-white px-3 outline-none focus:border-[#127d84]" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option === "All" ? "Todos" : option}
        </option>
      ))}
    </select>
  );
}

function CardTile({ card, owned, onOpen, onSetOwned, onAddToDeck }: { card: DigimonCard; owned: number; onOpen: () => void; onSetOwned: (quantity: number) => void; onAddToDeck?: () => void }) {
  return (
    <article className="skeuo-card grid grid-cols-[92px_1fr] gap-3 rounded-md p-3">
      <button className="card-sleeve overflow-hidden rounded-md bg-[#eef0e9] p-1" onClick={onOpen}>
        <img className="aspect-[5/7] h-full w-full object-cover" src={card.imageUrl} alt={card.name} loading="lazy" />
      </button>
      <div className="min-w-0">
        <button className="block max-w-full truncate text-left font-bold" onClick={onOpen}>
          {card.name}
        </button>
        <p className="text-sm text-[#60706d]">{card.cardNumber}</p>
        <p className="mt-1 line-clamp-1 text-sm text-[#60706d]">
          {card.color.join("/")} · {card.form ?? card.type} · {card.rarity.toUpperCase()}
        </p>
        <p className={`mt-1 text-xs font-semibold ${card.isAlternateArt ? "text-[#b14d19]" : "text-[#127d84]"}`}>
          {card.variantLabel}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <QuantityStepper value={owned} onChange={onSetOwned} label="Tengo" />
          {onAddToDeck && (
            <button className="skeuo-button grid h-9 w-9 place-items-center rounded-md text-[#127d84]" title="Agregar al deck activo" onClick={onAddToDeck}>
              <BookOpen size={17} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function QuantityStepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-[#60706d]">{label}</span>
      <button className="skeuo-button grid h-8 w-8 place-items-center rounded-md" title="Reducir" onClick={() => onChange(Math.max(value - 1, 0))}>
        <Minus size={15} />
      </button>
      <select className="h-8 rounded-md border border-[#b99d76] bg-[#fff9ed] px-2 shadow-inner" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {quantityOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button className="skeuo-button grid h-8 w-8 place-items-center rounded-md" title="Aumentar" onClick={() => onChange(value + 1)}>
        <Plus size={15} />
      </button>
    </div>
  );
}

function DeckSummary({ decks, stats, onOpen }: { decks: Deck[]; stats: ReturnType<typeof getDeckStats>[]; onOpen: (deckId: string) => void }) {
  if (decks.length === 0) return <EmptyState title="Todavía no hay decks" detail="Creá uno para empezar a ver faltantes contra tu colección." />;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">Resumen de decks</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {decks.slice(0, 3).map((deck, index) => (
          <button key={deck.id} className="skeuo-card rounded-md p-4 text-left" onClick={() => onOpen(deck.id)}>
            <span className="block font-semibold">{deck.name}</span>
            <span className="mt-2 block text-sm text-[#60706d]">
              {stats[index].totalCards} cartas · {stats[index].missingCopies === 0 ? "Completo" : `${stats[index].missingDistinct} cartas distintas faltantes`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeckEditorHeader({
  deck,
  coverCard,
  stats,
  isEditing,
  onDescriptionChange,
  onPublicChange,
  onDelete,
}: {
  deck: Deck;
  coverCard?: DigimonCard;
  stats: ReturnType<typeof getDeckStats>;
  isEditing: boolean;
  onDescriptionChange: (description: string) => void;
  onPublicChange: (isPublic: boolean) => void;
  onDelete: () => void;
}) {
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/decks/${deck.id}` : "";

  return (
    <div className="skeuo-card overflow-hidden rounded-md">
      <div
        className="min-h-44 p-4 text-white"
        style={{
          backgroundImage: coverCard
            ? `linear-gradient(90deg, rgba(20,28,32,0.96), rgba(20,28,32,0.72), rgba(20,28,32,0.2)), url(${coverCard.imageUrl})`
            : "linear-gradient(135deg, #127d84, #1b2424)",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{deck.name}</h1>
            <p className="mt-2 text-sm text-white/80">
              Main deck: {stats.totalCards} / 50 · Digi-Egg: {stats.eggCards} / 5
            </p>
            {coverCard && <p className="mt-2 text-sm font-semibold text-[#f4c430]">Portada: {coverCard.name}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {isEditing ? (
                <button
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${deck.isPublic ? "bg-[#e3f6df] text-[#187a45]" : "bg-white/15 text-white"}`}
                  onClick={() => onPublicChange(!(deck.isPublic ?? false))}
                >
                  {deck.isPublic ? "Publicado" : "Privado"}
                </button>
              ) : (
                <span className={`rounded-md px-3 py-2 text-sm font-semibold ${deck.isPublic ? "bg-[#e3f6df] text-[#187a45]" : "bg-white/15 text-white"}`}>
                  {deck.isPublic ? "Publicado" : "Privado"}
                </span>
              )}
              {deck.isPublic && (
                <button
                  className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => navigator.clipboard.writeText(publicUrl)}
                >
                  <Share2 size={15} />
                  Copiar link
                </button>
              )}
            </div>
          </div>
        {isEditing && (
          <button className="grid h-10 w-10 place-items-center rounded-md border border-white/25 bg-black/20 text-white" title="Eliminar deck" onClick={onDelete}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
      </div>
      <div className="p-4">
        <label className="text-xs font-bold uppercase tracking-wide text-[#60706d]" htmlFor={`deck-description-${deck.id}`}>
          Deck primer
        </label>
        {isEditing ? (
          <textarea
            id={`deck-description-${deck.id}`}
            className="mt-2 min-h-20 w-full resize-y rounded-md border border-[#c9d2cd] px-3 py-2 outline-none focus:border-[#127d84]"
            value={deck.description ?? ""}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Notas, plan de juego o idea principal del deck..."
          />
        ) : (
          <p className="mt-2 min-h-12 rounded-md border border-[#d9ded6] bg-[#fff4df] px-3 py-2 text-sm leading-6 text-[#1b2424] shadow-inner">
            {deck.description || "Sin descripción."}
          </p>
        )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Cartas distintas" value={deck.cards.length.toString()} detail="en la lista" />
        <Metric label="Faltan distintas" value={stats.missingDistinct.toString()} detail="cartas no completas" />
        <Metric label="Faltan copias" value={stats.missingCopies.toString()} detail="total requerido" />
      </div>
      </div>
    </div>
  );
}

function DeckImportPanel({ onImport, disabled }: { onImport: (text: string) => DeckImportResult; disabled: boolean }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<DeckImportResult | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextResult = onImport(text);
    setResult(nextResult);
    if (nextResult.importedLines > 0) {
      setText("");
    }
  }

  return (
    <form className="skeuo-card rounded-md p-4" onSubmit={handleSubmit}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f4c430] text-[#1b2424]">
          <ClipboardList size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Importar lista</h2>
          <p className="mt-1 text-sm text-[#60706d]">Pegá una lista con cantidad y número de carta.</p>
        </div>
      </div>
      <textarea
        className="mt-3 min-h-32 w-full resize-y rounded-md border border-[#c9d2cd] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#127d84]"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={"4 BT1-010 Agumon\n4 BT1-015 Greymon\n2 BT1-084 Tai Kamiya"}
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#60706d]">Formato: cantidad, nombre opcional y número. Cada carta se declara una vez.</p>
        <button
          className="skeuo-primary flex items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || text.trim().length === 0}
        >
          <Plus size={17} />
          Importar
        </button>
      </div>
      {result && (
        <div className="mt-3 rounded-md bg-[#fff4df] p-3 text-sm shadow-inner">
          <p className="font-semibold">
            {result.importedLines} líneas importadas · {result.importedCopies} copias agregadas
          </p>
          {result.notFound.length > 0 && (
            <p className="mt-2 text-[#b14d19]">No encontré: {result.notFound.slice(0, 6).join(", ")}</p>
          )}
          {result.ignored.length > 0 && (
            <p className="mt-2 text-[#60706d]">Ignoradas: {result.ignored.slice(0, 4).join(" | ")}</p>
          )}
        </div>
      )}
    </form>
  );
}

function DeckSection({
  title,
  items,
  ownedByCardNumber,
  onChange,
  onOpen,
  coverCardNumber,
  isEditing,
  onSetCover,
}: {
  title: string;
  items: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }>;
  ownedByCardNumber: CollectionMap;
  onChange: (cardNumber: string, quantity: number) => void;
  onOpen: (card: DigimonCard) => void;
  coverCardNumber?: string;
  isEditing: boolean;
  onSetCover: (cardNumber: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-[#1b2424]">{title}</h3>
      <div className="grid gap-2">
        {items.map((item) => (
          <DeckCardRow
            key={item.cardNumber}
            card={item.card}
            required={item.quantityRequired}
            owned={ownedByCardNumber[normalizeCardNumber(item.cardNumber)] ?? 0}
            onOpen={() => onOpen(item.card)}
            onChange={(quantity) => onChange(item.cardNumber, quantity)}
            isCover={normalizeCardNumber(coverCardNumber ?? "") === normalizeCardNumber(item.cardNumber)}
            isEditing={isEditing}
            onSetCover={() => onSetCover(item.cardNumber)}
          />
        ))}
      </div>
    </div>
  );
}

function DeckCardRow({
  card,
  required,
  owned,
  onOpen,
  onChange,
  isCover,
  isEditing,
  onSetCover,
}: {
  card: DigimonCard;
  required: number;
  owned: number;
  onOpen: () => void;
  onChange: (quantity: number) => void;
  isCover: boolean;
  isEditing: boolean;
  onSetCover: () => void;
}) {
  const missing = Math.max(required - owned, 0);

  return (
    <article
      className={`grid grid-cols-[72px_1fr] gap-3 rounded-md border p-3 shadow-sm sm:grid-cols-[82px_1fr_auto] sm:items-center ${isCover ? "border-[#f4c430]" : "border-[#b99d76]"}`}
      style={{ background: getCardRowBackground(card.color) }}
    >
      <button className="card-sleeve overflow-hidden rounded-md bg-[#eef0e9] p-1" onClick={onOpen} title="Ver carta">
        <img className="aspect-[5/7] h-full w-full object-cover" src={card.imageUrl} alt={card.name} loading="lazy" />
      </button>
      <div className="min-w-0">
        <button className="max-w-full truncate text-left font-semibold" onClick={onOpen}>
          {card.name}
        </button>
        <p className="text-sm text-[#60706d]">
          {card.cardNumber} · Necesito {required} · Tengo {owned}
        </p>
        <p className={`mt-1 flex items-center gap-1 text-sm font-semibold ${missing === 0 ? "text-[#187a45]" : "text-[#b14d19]"}`}>
          {missing === 0 ? <CheckCircle2 size={15} /> : <ChevronLeft size={15} />}
          {missing === 0 ? "Completa" : `Falta ${missing}`}
        </p>
      </div>
      {isEditing && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            className={`grid h-9 w-9 place-items-center rounded-md border ${isCover ? "border-[#f4c430] bg-[#f4c430] text-[#1b2424]" : "skeuo-button text-[#60706d]"}`}
            title={isCover ? "Portada actual" : "Usar como portada"}
            onClick={onSetCover}
          >
            <Crown size={16} />
          </button>
          <QuantityStepper value={required} onChange={onChange} label="Deck" />
        </div>
      )}
    </article>
  );
}

function CompactDeckList({
  groups,
  ownedByCardNumber,
  coverCardNumber,
  isEditing,
  onOpen,
  onSetCover,
}: {
  groups: Array<{ title: string; items: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> }>;
  ownedByCardNumber: CollectionMap;
  coverCardNumber?: string;
  isEditing: boolean;
  onOpen: (card: DigimonCard) => void;
  onSetCover: (cardNumber: string) => void;
}) {
  return (
    <div className="skeuo-card grid gap-5 rounded-md p-4 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title} className="space-y-2">
          <h3 className="border-b binder-divider pb-2 font-bold">
            {group.title} ({group.items.reduce((sum, item) => sum + item.quantityRequired, 0)})
          </h3>
          <div className="space-y-1">
            {group.items.map((item) => (
              <CompactDeckRow
                key={item.cardNumber}
                item={item}
                owned={ownedByCardNumber[normalizeCardNumber(item.cardNumber)] ?? 0}
                isCover={normalizeCardNumber(coverCardNumber ?? "") === normalizeCardNumber(item.cardNumber)}
                isEditing={isEditing}
                onOpen={() => onOpen(item.card)}
                onSetCover={() => onSetCover(item.cardNumber)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactDeckRow({
  item,
  owned,
  isCover,
  isEditing,
  onOpen,
  onSetCover,
}: {
  item: { cardNumber: string; card: DigimonCard; quantityRequired: number };
  owned: number;
  isCover: boolean;
  isEditing: boolean;
  onOpen: () => void;
  onSetCover: () => void;
}) {
  const missing = Math.max(item.quantityRequired - owned, 0);

  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[#fff4df]">
      <span className="font-semibold text-[#1d5fa8]">{item.quantityRequired}</span>
      <button className="truncate text-left font-semibold" onClick={onOpen}>
        {item.card.name}
        <span className="ml-1 text-[10px] font-normal text-[#60706d]">{item.card.cardNumber}</span>
      </button>
      <span className={`h-2.5 w-2.5 rounded-full ${missing === 0 ? "bg-[#187a45]" : "bg-[#d9534f]"}`} title={missing === 0 ? "Completa" : `Falta ${missing}`} />
      {isEditing ? (
        <button
          className={`grid h-7 w-7 place-items-center rounded ${isCover ? "bg-[#f4c430] text-[#1b2424]" : "text-[#60706d] hover:bg-white"}`}
          title={isCover ? "Portada actual" : "Usar como portada"}
          onClick={onSetCover}
        >
          <Crown size={14} />
        </button>
      ) : (
        <span className="w-7" />
      )}
    </div>
  );
}

function AddDeckCardTile({ card, required, owned, onChange }: { card: DigimonCard; required: number; owned: number; onChange: (quantity: number) => void }) {
  return (
    <article className="skeuo-card grid grid-cols-[64px_1fr] gap-3 rounded-md p-3">
      <div className="card-sleeve rounded-md p-1">
        <img className="aspect-[5/7] rounded object-cover" src={card.imageUrl} alt={card.name} loading="lazy" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{card.name}</h3>
        <p className="text-sm text-[#60706d]">
          {card.cardNumber} · Tengo {owned}
        </p>
        <div className="mt-2">
          <QuantityStepper value={required} onChange={onChange} label="Deck" />
        </div>
      </div>
    </article>
  );
}

function CardDetail({
  card,
  owned,
  onClose,
  onSetOwned,
}: {
  card: DigimonCard;
  owned: number;
  onClose: () => void;
  onSetOwned: (quantity: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <section className="skeuo-card max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-md p-4 sm:rounded-md" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{card.name}</h2>
            <p className="text-sm text-[#60706d]">
              {card.cardNumber} · {card.setName}
            </p>
            <p className={`mt-1 text-sm font-semibold ${card.isAlternateArt ? "text-[#b14d19]" : "text-[#127d84]"}`}>
              {card.variantLabel}
            </p>
          </div>
          <button className="skeuo-button grid h-10 w-10 place-items-center rounded-md" onClick={onClose} title="Cerrar">
            ×
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="card-sleeve rounded-md p-2">
            <img className="w-full rounded-md bg-[#eef0e9]" src={card.imageUrl} alt={card.name} />
          </div>
          <div className="space-y-3">
            <Info label="Color" value={card.color.join(" / ")} />
            <Info label="Tipo" value={card.type} />
            <Info label="Nivel" value={card.level?.toString() ?? "-"} />
            <Info label="Rareza" value={card.rarity.toUpperCase()} />
            <Info label="Costo" value={card.playCost?.toString() ?? "-"} />
            <Info label="DP" value={card.dp?.toString() ?? "-"} />
            <div>
              <p className="text-sm font-semibold text-[#60706d]">Cantidad en mi colección</p>
              <div className="mt-2">
                <QuantityStepper value={owned} onChange={onSetOwned} label="Tengo" />
              </div>
            </div>
            {card.effect && (
              <p className="rounded-md bg-[#fff4df] p-3 text-sm leading-7 shadow-inner">
                <HighlightedEffectText text={card.effect} />
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function HighlightedEffectText({ text }: { text: string }) {
  const tokens = text.split(/(\[[^\]]+\]|<[^>]+>|＜[^＞]+＞)/g);

  return (
    <>
      {tokens.map((token, index) => {
        if (!token) return null;
        if (token.startsWith("[") && token.endsWith("]")) {
          return (
            <span key={`${token}-${index}`} className="rounded bg-[#dfeeff] px-1.5 py-0.5 font-semibold text-[#1d5fa8]">
              {token}
            </span>
          );
        }
        if ((token.startsWith("<") && token.endsWith(">")) || (token.startsWith("＜") && token.endsWith("＞"))) {
          return (
            <span key={`${token}-${index}`} className="rounded bg-[#e3f6df] px-1.5 py-0.5 font-semibold text-[#187a45]">
              {token}
            </span>
          );
        }

        return <span key={`${token}-${index}`}>{token}</span>;
      })}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-[#60706d]">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#b9c5bf] bg-white/75 p-5 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[#60706d]">{detail}</p>
    </div>
  );
}

function getDeckStats(deck: Deck, ownedByCardNumber: CollectionMap, cardsByNumber?: Map<string, DigimonCard>) {
  return deck.cards.reduce(
    (stats, deckCard) => {
      const cardNumber = deckCard.cardNumber ?? deckCard.cardId;
      const card = cardsByNumber?.get(normalizeCardNumber(cardNumber));
      const owned = ownedByCardNumber[normalizeCardNumber(cardNumber)] ?? 0;
      const missing = Math.max(deckCard.quantityRequired - owned, 0);
      const isDigiEgg = card?.type === "Digi-Egg";

      return {
        totalCards: stats.totalCards + (isDigiEgg ? 0 : deckCard.quantityRequired),
        eggCards: stats.eggCards + (isDigiEgg ? deckCard.quantityRequired : 0),
        missingDistinct: stats.missingDistinct + (missing > 0 ? 1 : 0),
        missingCopies: stats.missingCopies + missing,
      };
    },
    { totalCards: 0, eggCards: 0, missingDistinct: 0, missingCopies: 0 },
  );
}

function parseDeckList(text: string, cardsByNumber: Map<string, DigimonCard>) {
  const parsedCardsByNumber = new Map<string, Deck["cards"][number]>();
  const notFound: string[] = [];
  const ignored: string[] = [];
  const duplicateCards: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const parsedLine = parseDeckLine(line);
    if (!parsedLine) {
      ignored.push(line);
      continue;
    }

    const card = cardsByNumber.get(normalizeCardNumber(parsedLine.cardNumber));
    if (!card) {
      notFound.push(parsedLine.cardNumber);
      continue;
    }

    const normalizedCardNumber = normalizeCardNumber(card.cardNumber);

    if (parsedCardsByNumber.has(normalizedCardNumber)) {
      duplicateCards.push(card.cardNumber);
      continue;
    }

    parsedCardsByNumber.set(normalizedCardNumber, {
      cardNumber: card.cardNumber,
      cardId: card.cardNumber,
      quantityRequired: parsedLine.quantity,
    });
  }

  const duplicateNotes = unique(duplicateCards).map((cardNumber) => `${cardNumber} duplicada`);

  return { cards: Array.from(parsedCardsByNumber.values()), notFound: unique(notFound), ignored: [...ignored, ...duplicateNotes] };
}

function parseDeckLine(line: string) {
  const normalized = line.replace(/\s+/g, " ");
  const cardNumberPattern = "([A-Z]{1,4}\\d{0,2}-\\d{2,4})";
  const patterns = [
    new RegExp(`^(\\d{1,2})x?\\s+${cardNumberPattern}\\b`, "i"),
    new RegExp(`^(\\d{1,2})x?\\s+.*?\\s${cardNumberPattern}\\b`, "i"),
    new RegExp(`^${cardNumberPattern}\\s+x?(\\d{1,2})\\b`, "i"),
    new RegExp(`^${cardNumberPattern}\\b.*?\\sx(\\d{1,2})$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const firstValue = match[1] ?? "";
    const secondValue = match[2] ?? "";
    const quantity = Number(/^\d/.test(firstValue) ? firstValue : secondValue);
    const cardNumber = /^\d/.test(firstValue) ? secondValue : firstValue;

    if (!quantity || !cardNumber) return null;

    return {
      cardNumber,
      quantity: Math.min(Math.max(quantity, 1), maxDeckQuantity),
    };
  }

  const cardNumberOnly = normalized.match(new RegExp(`^${cardNumberPattern}\\b`, "i"));
  if (cardNumberOnly?.[1]) {
    return {
      cardNumber: cardNumberOnly[1],
      quantity: 1,
    };
  }

  return null;
}

function toUserProfile(user: SupabaseUser): UserProfile {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName:
      getStringMetadata(user.user_metadata.full_name) ??
      getStringMetadata(user.user_metadata.name) ??
      user.email?.split("@")[0] ??
      "Tamer",
  };
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
    cards: (row.deck_cards ?? []).map((deckCard) => ({
      cardNumber: deckCard.card_number,
      cardId: deckCard.card_number,
      quantityRequired: deckCard.quantity_required,
    })),
  };
}

function getStringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getRegularCardsByNumber(cards: DigimonCard[]) {
  const cardsByNumber = new Map<string, DigimonCard>();

  for (const card of cards) {
    const key = normalizeCardNumber(card.cardNumber);
    const current = cardsByNumber.get(key);
    if (!current || card.parallelId < current.parallelId) {
      cardsByNumber.set(key, card);
    }
  }

  return cardsByNumber;
}

function getOwnedByCardNumber(collection: CollectionMap, cardsById: Map<string, DigimonCard>) {
  const ownedByCardNumber: CollectionMap = {};

  for (const [variantId, quantity] of Object.entries(collection)) {
    const card = cardsById.get(variantId);
    const cardNumber = card?.cardNumber ?? variantId;
    const key = normalizeCardNumber(cardNumber);
    ownedByCardNumber[key] = (ownedByCardNumber[key] ?? 0) + quantity;
  }

  return ownedByCardNumber;
}

function splitDeckCards(deck: Deck | undefined, cardsByNumber: Map<string, DigimonCard>) {
  const main: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> = [];
  const eggs: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> = [];
  const digimon: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> = [];
  const options: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> = [];
  const tamers: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> = [];

  for (const deckCard of deck?.cards ?? []) {
    const cardNumber = deckCard.cardNumber ?? deckCard.cardId;
    const card = cardsByNumber.get(normalizeCardNumber(cardNumber));
    if (!card) continue;

    const item = { cardNumber, card, quantityRequired: deckCard.quantityRequired };
    if (card.type === "Digi-Egg") {
      eggs.push(item);
    } else {
      main.push(item);
      if (card.type === "Option") {
        options.push(item);
      } else if (card.type === "Tamer") {
        tamers.push(item);
      } else {
        digimon.push(item);
      }
    }
  }

  const groups = [
    { title: "Digimon", items: digimon },
    { title: "Option", items: options },
    { title: "Tamer", items: tamers },
    { title: "Egg Deck", items: eggs },
  ].filter((group) => group.items.length > 0);

  return {
    main,
    eggs,
    all: [...main, ...eggs],
    groups,
    mainCount: main.reduce((sum, item) => sum + item.quantityRequired, 0),
    eggCount: eggs.reduce((sum, item) => sum + item.quantityRequired, 0),
  };
}

function getDeckCoverCard(
  deck: Deck | undefined,
  deckCards: Array<{ cardNumber: string; card: DigimonCard }>,
  cardsByNumber: Map<string, DigimonCard>,
) {
  const coverNumber = deck?.coverCardNumber;
  if (coverNumber) {
    const cover = cardsByNumber.get(normalizeCardNumber(coverNumber));
    if (cover) return cover;
  }

  return deckCards.find((item) => item.card.type !== "Digi-Egg")?.card ?? deckCards[0]?.card;
}

function getCardRowBackground(colors: string[]) {
  const palette: Record<string, string> = {
    Red: "#ffe6e2",
    Blue: "#e4efff",
    Yellow: "#fff5cf",
    Green: "#ddf6e4",
    Purple: "#efe6ff",
    Black: "#e5e7eb",
    White: "#ffffff",
  };
  const stops = colors.map((color) => palette[color] ?? "#f7f7f2");

  if (stops.length <= 1) {
    return `linear-gradient(90deg, ${stops[0] ?? "#ffffff"}, rgba(255,255,255,0.92) 62%)`;
  }

  const step = 100 / stops.length;
  return `linear-gradient(135deg, ${stops
    .map((stop, index) => `${stop} ${Math.round(index * step)}%, ${stop} ${Math.round((index + 1) * step)}%`)
    .join(", ")})`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCardNumber(cardNumber: string) {
  return cardNumber.trim().toUpperCase().replace(/_P\d+$/, "");
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is best effort in the MVP.
  }
}
