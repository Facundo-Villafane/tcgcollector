"use client";

import {
  Archive,
  BookOpen,
  Camera,
  Zap,
  ZapOff,
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
  ScanLine,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { CardPriceMap, CollectionMap, Deck, DigimonCard, UserProfile } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";

type View = "dashboard" | "catalog" | "collection" | "decks";
type DeckMode = "view" | "edit";

const STORAGE_KEYS = {
  collection: "tamer-binder:collection",
  decks: "tamer-binder:decks",
};

const maxDeckQuantity = 4;
const maxMainDeckCards = 50;
const maxEggDeckCards = 5;

type DeckImportResult = {
  importedLines: number;
  importedCopies: number;
  notFound: string[];
  ignored: string[];
  limited: string[];
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
  const [collectionQuery, setCollectionQuery] = useState("");
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
  const [selectedCardPlayableNumber, setSelectedCardPlayableNumber] = useState<string | null>(null);
  const [showDeckImages, setShowDeckImages] = useState(true);
  const [cardPrices, setCardPrices] = useState<CardPriceMap>({});
  const [priceStatus, setPriceStatus] = useState("Precios pendientes");

  useEffect(() => {
    queueMicrotask(() => {
      const savedCollection = readStorage<CollectionMap>(STORAGE_KEYS.collection, {});
      const savedDecks = readStorage<Deck[]>(STORAGE_KEYS.decks, []);
      setCollection(savedCollection);
      setDecks(savedDecks);
      setActiveDeckId("");
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
    const activeQuery = view === "collection" ? collectionQuery : query;
    const normalizedQuery = activeQuery.trim().toLowerCase();

    const result = cards.filter((card) => {
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
    });

    return view === "catalog" ? result.slice(0, 80) : result;
  }, [cards, color, collectionQuery, query, setCode, type, view]);

  const colors = useMemo(() => unique(cards.flatMap((card) => card.color)).sort(), [cards]);
  const types = useMemo(() => unique(cards.map((card) => card.type)).sort(), [cards]);
  const sets = useMemo(() => unique(cards.map((card) => card.setCode)).sort(), [cards]);
  const activeDeck = decks.find((deck) => deck.id === activeDeckId);
  const ownedByCardNumber = useMemo(() => getOwnedByCardNumber(collection, cardsById), [collection, cardsById]);
  const deckStats = useMemo(
    () => decks.map((deck) => getDeckStats(deck, ownedByCardNumber, cardsByNumber)),
    [decks, ownedByCardNumber, cardsByNumber],
  );
  const deckPriceStats = useMemo(
    () => decks.map((deck) => getDeckPriceStats(deck, ownedByCardNumber, cardPrices)),
    [decks, ownedByCardNumber, cardPrices],
  );
  const activeDeckCards = useMemo(
    () => splitDeckCards(activeDeck, cardsByNumber),
    [activeDeck, cardsByNumber],
  );
  const pricedCardNumbers = useMemo(
    () => getPricedCardNumbers(decks, publicDecks, collectionCards),
    [collectionCards, decks, publicDecks],
  );
  const totalMissingCopies = deckStats.reduce((sum, stat) => sum + stat.missingCopies, 0);
  const ownedCopies = Object.values(collection).reduce((sum, quantity) => sum + quantity, 0);
  const totalMissingValue = deckPriceStats.reduce((sum, stat) => sum + stat.missingValue, 0);
  const collectionValue = getCollectionValue(collection, cardsById, cardPrices);

  useEffect(() => {
    if (pricedCardNumbers.length === 0) return;

    let isMounted = true;
    const controller = new AbortController();

    async function loadPrices() {
      setPriceStatus("Actualizando precios...");
      const response = await fetch(`/api/prices?cards=${encodeURIComponent(pricedCardNumbers.slice(0, 120).join(","))}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        if (isMounted) setPriceStatus("Precios no disponibles");
        return;
      }

      const payload = (await response.json()) as { prices?: CardPriceMap; sourceReady?: boolean };
      if (!isMounted) return;

      setCardPrices((current) => ({ ...current, ...(payload.prices ?? {}) }));
      setPriceStatus(payload.sourceReady ? "Precios sincronizados" : "Configurar TCGAPI_KEY para actualizar precios");
    }

    loadPrices().catch(() => {
      if (isMounted) setPriceStatus("Precios no disponibles");
    });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [pricedCardNumbers]);

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
    setActiveDeckId("");
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

  function addCardCopy(card: DigimonCard) {
    setOwnedQuantity(card.id, (collection[card.id] ?? 0) + 1);
  }

  function setPlayableOwnedQuantity(card: DigimonCard, quantity: number) {
    const playableNumber = normalizeCardNumber(card.cardNumber);
    const regularOwned = collection[card.id] ?? 0;
    const totalOwned = ownedByCardNumber[playableNumber] ?? 0;
    const ownedFromOtherVariants = Math.max(totalOwned - regularOwned, 0);
    setOwnedQuantity(card.id, Math.max(quantity - ownedFromOtherVariants, 0));
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
        const limitedQuantity = getAllowedDeckQuantity(deck, cardNumber, quantityRequired, cardsByNumber);
        const existing = deck.cards.find(
          (deckCard) => normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) === normalizedCardNumber,
        );
        const nextCards =
          limitedQuantity <= 0
            ? deck.cards.filter(
                (deckCard) => normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) !== normalizedCardNumber,
              )
            : existing
              ? deck.cards.map((deckCard) =>
                  normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) === normalizedCardNumber
                    ? { ...deckCard, cardNumber, cardId: cardNumber, quantityRequired: limitedQuantity }
                    : deckCard,
                )
              : [...deck.cards, { cardNumber, cardId: cardNumber, quantityRequired: limitedQuantity }];

        return { ...deck, cards: nextCards, updatedAt: new Date().toISOString() };
      }),
    );
  }

  function importDeckList(deckId: string, text: string): DeckImportResult {
    const parsed = parseDeckList(text, cardsByNumber);
    const targetDeck = decks.find((deck) => deck.id === deckId);
    const limited = targetDeck ? getDeckLimitMessages(targetDeck.cards, parsed.cards, cardsByNumber) : [];

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

          const limitedCards = enforceDeckLimits(
            Array.from(quantities.entries()).map(([cardNumber, quantityRequired]) => ({
              cardNumber,
              cardId: cardNumber,
              quantityRequired,
            })),
            cardsByNumber,
          );

          return {
            ...deck,
            cards: limitedCards,
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
      limited,
    };
  }

  function deleteDeck(deckId: string) {
    setDecks((current) => current.filter((deck) => deck.id !== deckId));
    if (activeDeckId === deckId) {
      setActiveDeckId("");
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
    <main className="min-h-screen pb-32">
      <header className="skeuo-binder sticky top-0 z-20 text-[#20282b] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button className="flex items-center gap-2 text-left" onClick={() => setView("dashboard")}>
            <span className="binder-stitch grid h-10 w-10 place-items-center rounded-md bg-[#e8edf0] text-[#127d84]">
              <Archive size={22} />
            </span>
            <span>
              <span className="block text-lg font-bold leading-tight">Tamer Binder</span>
              <span className="block text-xs text-[#60706d]">
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
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {view === "dashboard" && (
          <section className="skeuo-shell space-y-6 rounded-md p-4 sm:p-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#127d84]">Digimon Card Game</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Colección, decks y comunidad.</h1>
            </div>

            {user && <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Cartas registradas" value={collectionCards.length.toString()} detail={`${ownedCopies} copias`} />
              <Metric label="Mis decks" value={decks.length.toString()} detail="listas creadas" />
              <Metric label="Copias faltantes" value={totalMissingCopies.toString()} detail={`${formatKnownMoney(totalMissingValue, deckPriceStats.some((stat) => stat.pricedCards > 0))} estimado`} />
              <Metric label="Valor estimado" value={formatKnownMoney(collectionValue, collectionValue > 0)} detail={priceStatus} />
            </div>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionButton icon={<Search size={20} />} label="Buscar cartas" onClick={() => setView("catalog")} />
              <ActionButton icon={<Library size={20} />} label="Mi colección" onClick={() => user ? setView("collection") : handleGoogleLogin()} />
              <ActionButton icon={<BookOpen size={20} />} label="Mis decks" onClick={() => {
                if (!user) {
                  handleGoogleLogin();
                  return;
                }
                setActiveDeckId("");
                setView("decks");
              }} />
              {!user && <ActionButton icon={<UserIcon size={20} />} label="Entrar" onClick={handleGoogleLogin} />}
            </div>

            {authError && <p className="text-sm font-semibold text-[#d9534f]">{authError}</p>}

            <LatestDecks decks={publicDecks} cardsByNumber={cardsByNumber} cardPrices={cardPrices} />
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
                query={view === "collection" ? collectionQuery : query}
                setQuery={view === "collection" ? setCollectionQuery : setQuery}
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

            <CollectionScanner
              cardsByNumber={cardsByNumber}
              onAddCard={addCardCopy}
              disabled={cards.length === 0}
            />

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
                      setSelectedCardPlayableNumber(null);
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
                  const priceStats = getDeckPriceStats(deck, ownedByCardNumber, cardPrices);
                  const cover = getDeckCoverCard(deck, splitDeckCards(deck, cardsByNumber).all, cardsByNumber);
                  return (
                    <button
                      key={deck.id}
                      className={`grid w-full grid-cols-[64px_1fr] gap-3 rounded-md border p-2 text-left shadow-sm ${
                        activeDeck?.id === deck.id ? "border-[#127d84] bg-[#e9f5f3]" : "border-[#d9ded6] bg-white"
                      }`}
                      onClick={() => {
                        setActiveDeckId(deck.id);
                        setDeckMode("view");
                      }}
                    >
                      <span
                        className="block h-20 rounded bg-[#1b2424]"
                        style={{
                          backgroundImage: cover
                            ? `linear-gradient(180deg, rgba(20,28,32,0.08), rgba(20,28,32,0.7)), url(${cover.imageUrl})`
                            : "linear-gradient(135deg, #127d84, #1b2424)",
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                        }}
                      />
                      <span className="min-w-0 self-center">
                        <span className="block truncate font-semibold">{deck.name}</span>
                        <span className="mt-1 block text-sm text-[#60706d]">
                          {stats.totalCards} cartas · {stats.missingCopies === 0 ? "Completo" : `${stats.missingCopies} copias faltantes`}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-[#127d84]">
                          Deck {formatKnownMoney(priceStats.totalValue, priceStats.pricedCards > 0)} · Faltan {formatKnownMoney(priceStats.missingValue, priceStats.pricedCards > 0)}
                        </span>
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
                    priceStats={getDeckPriceStats(activeDeck, ownedByCardNumber, cardPrices)}
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
                              cardPrices={cardPrices}
                              getMaxQuantity={(cardNumber) => getAllowedDeckQuantity(activeDeck, cardNumber, maxDeckQuantity, cardsByNumber)}
                              onChange={(cardNumber, quantity) => setDeckQuantity(activeDeck.id, cardNumber, quantity)}
                              onOpen={(card) => {
                                setSelectedCardPlayableNumber(normalizeCardNumber(card.cardNumber));
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
                              cardPrices={cardPrices}
                              getMaxQuantity={(cardNumber) => getAllowedDeckQuantity(activeDeck, cardNumber, maxDeckQuantity, cardsByNumber)}
                              onChange={(cardNumber, quantity) => setDeckQuantity(activeDeck.id, cardNumber, quantity)}
                              onOpen={(card) => {
                                setSelectedCardPlayableNumber(normalizeCardNumber(card.cardNumber));
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
                            cardPrices={cardPrices}
                            coverCardNumber={activeDeck.coverCardNumber}
                            isEditing={deckMode === "edit"}
                            onOpen={(card) => {
                              setSelectedCardPlayableNumber(normalizeCardNumber(card.cardNumber));
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
                          const maxQuantity = getAllowedDeckQuantity(activeDeck, card.cardNumber, maxDeckQuantity, cardsByNumber);
                          return (
                            <AddDeckCardTile
                              key={card.id}
                              card={card}
                              required={required}
                              owned={ownedByCardNumber[normalizeCardNumber(card.cardNumber)] ?? 0}
                              price={cardPrices[normalizeCardNumber(card.cardNumber)]?.marketPrice ?? null}
                              maxQuantity={maxQuantity}
                              onChange={(quantity) => setDeckQuantity(activeDeck.id, card.cardNumber, quantity)}
                            />
                          );
                        })}
                      </div>
                    </div>}
                  </div>
                </>
              ) : (
                <DeckLibrary
                  decks={decks}
                  stats={deckStats}
                  cardsByNumber={cardsByNumber}
                  onOpen={(deckId) => {
                    setActiveDeckId(deckId);
                    setDeckMode("view");
                  }}
                />
              )}
            </div>
          </section>
        )}
      </div>

      <BottomNavigation
        view={view}
        onDashboard={() => setView("dashboard")}
        onCatalog={() => setView("catalog")}
        onCollection={() => user ? setView("collection") : handleGoogleLogin()}
        onDecks={() => {
          if (!user) {
            handleGoogleLogin();
            return;
          }
          setActiveDeckId("");
          setView("decks");
        }}
      />

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          owned={selectedCardPlayableNumber ? ownedByCardNumber[selectedCardPlayableNumber] ?? 0 : collection[selectedCard.id] ?? 0}
          price={cardPrices[normalizeCardNumber(selectedCard.cardNumber)]?.marketPrice ?? null}
          onClose={() => {
            setSelectedCard(null);
            setSelectedCardPlayableNumber(null);
          }}
          onSetOwned={(quantity) => {
            if (selectedCardPlayableNumber) {
              setPlayableOwnedQuantity(selectedCard, quantity);
            } else {
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

function BottomNavigation({
  view,
  onDashboard,
  onCatalog,
  onCollection,
  onDecks,
}: {
  view: View;
  onDashboard: () => void;
  onCatalog: () => void;
  onCollection: () => void;
  onDecks: () => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-4">
      <div className="skeuo-shell mx-auto grid max-w-md grid-cols-4 gap-2 rounded-md p-2">
        <BottomNavItem icon={<ShieldCheck size={20} />} label="Inicio" active={view === "dashboard"} onClick={onDashboard} />
        <BottomNavItem icon={<Search size={20} />} label="Cartas" active={view === "catalog"} onClick={onCatalog} />
        <BottomNavItem icon={<Library size={20} />} label="Colección" active={view === "collection"} onClick={onCollection} />
        <BottomNavItem icon={<BookOpen size={20} />} label="Decks" active={view === "decks"} onClick={onDecks} />
      </div>
    </nav>
  );
}

function BottomNavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-bold leading-tight ${
        active ? "skeuo-primary text-white" : "text-[#60706d]"
      }`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <span className={active ? "text-white" : "text-[#127d84]"}>{icon}</span>
      <span className="truncate">{label}</span>
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

function LatestDecks({ decks, cardsByNumber, cardPrices }: { decks: Deck[]; cardsByNumber: Map<string, DigimonCard>; cardPrices: CardPriceMap }) {
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
          const priceStats = getDeckPriceStats(deck, {}, cardPrices);
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
                <p className="text-xs text-white/80">{deck.viewCount ?? 0} views Â· {formatKnownMoney(priceStats.totalValue, priceStats.pricedCards > 0)}</p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function CollectionScanner({
  cardsByNumber,
  onAddCard,
  disabled,
}: {
  cardsByNumber: Map<string, DigimonCard>;
  onAddCard: (card: DigimonCard) => void;
  disabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualNumber, setManualNumber] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [pendingCard, setPendingCard] = useState<DigimonCard | null>(null);
  const [scanStatus, setScanStatus] = useState("");
  const [detectedText, setDetectedText] = useState("");

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
      const track = streamRef.current.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setIsTorchSupported(!!caps?.torch);
    }
  }, [isCameraOpen]);

  function addByNumber(rawValue: string) {
    const cardNumber = extractCardNumber(rawValue);
    if (!cardNumber) {
      setScanStatus("No encontré un número válido. Probá EX7-004, BT1-010 o P-038.");
      return;
    }

    const card = cardsByNumber.get(normalizeCardNumber(cardNumber));
    if (!card) {
      setScanStatus(`No encontré ${cardNumber} en el catálogo.`);
      return;
    }

    onAddCard(card);
    setManualNumber("");
    setScanStatus(`${card.name} ${card.cardNumber} +1 a tu colección.`);
  }

  async function openCamera() {
    setScanStatus("");
    setDetectedText("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("Este navegador no permite abrir la cámara desde la web.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setScanStatus("No pude abrir la cámara. Revisá permisos del navegador.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setIsScanning(false);
    setIsTorchOn(false);
    setIsTorchSupported(false);
    setPendingCard(null);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !isTorchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setIsTorchOn(next);
    } catch {
      // torch applyConstraints failed silently
    }
  }

  async function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setScanStatus("La cámara todavía está iniciando. Probá de nuevo en un segundo.");
      return;
    }

    setIsScanning(true);
    setScanStatus("Leyendo número de carta...");
    setDetectedText("");

    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas no disponible.");

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;

      const { PSM, recognize } = await import("tesseract.js");

      const regions = [
        { name: "número abajo derecha", x: 0.52, y: 0.58, width: 0.46, height: 0.2, mode: PSM.SINGLE_LINE },
        { name: "franja nombre derecha", x: 0.36, y: 0.56, width: 0.62, height: 0.25, mode: PSM.SPARSE_TEXT },
        { name: "franja inferior", x: 0, y: 0.52, width: 1, height: 0.46, mode: PSM.SPARSE_TEXT },
      ];

      const filterPasses = [
        { name: "contraste", filter: "contrast(1.8) grayscale(1)" },
        { name: "foil claro", filter: "brightness(1.35) contrast(2.8) grayscale(1)" },
        { name: "foil oscuro", filter: "brightness(0.58) contrast(3) grayscale(1)" },
        { name: "binarizado", filter: "contrast(2.4) grayscale(1)", threshold: 148 },
        { name: "invertido", filter: "invert(1) contrast(2.2) grayscale(1)", threshold: 132, invert: true },
      ];

      let cardNumber = "";
      const ocrAttempts: string[] = [];

      for (const region of regions) {
        const sourceX = Math.floor(sourceWidth * region.x);
        const sourceY = Math.floor(sourceHeight * region.y);
        const regionWidth = Math.floor(sourceWidth * region.width);
        const regionHeight = Math.floor(sourceHeight * region.height);
        const targetWidth = Math.max(640, regionWidth * 2);
        const targetHeight = Math.max(180, regionHeight * 2);

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        for (const pass of filterPasses) {
          context.clearRect(0, 0, targetWidth, targetHeight);
          context.filter = pass.filter;
          context.drawImage(video, sourceX, sourceY, regionWidth, regionHeight, 0, 0, targetWidth, targetHeight);

          if (pass.threshold) {
            applyThreshold(context, targetWidth, targetHeight, pass.threshold, pass.invert ?? false);
          }

          const result = await recognize(canvas, "eng", {
            tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
            tessedit_pageseg_mode: region.mode,
          } as unknown as Parameters<typeof recognize>[2]);
          const text = result.data.text.trim();
          ocrAttempts.push(`${region.name} / ${pass.name}: ${text}`);
          cardNumber = extractCardNumber(text);
          if (cardNumber) break;
        }

        if (cardNumber) break;
      }

      setDetectedText(ocrAttempts.filter(Boolean).join("\n\n"));

      if (!cardNumber) {
        setScanStatus("No pude leer el número. Acercá la carta, evitá reflejos o escribilo manualmente.");
        return;
      }

      const card = cardsByNumber.get(normalizeCardNumber(cardNumber));
      if (!card) {
        setScanStatus(`Leí ${cardNumber}, pero no está en el catálogo.`);
        return;
      }

      setPendingCard(card);
      setScanStatus("");
    } catch {
      setScanStatus("Falló el OCR local. Podés sumar la carta escribiendo el número.");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <section className="skeuo-card space-y-3 rounded-md p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <ScanLine size={18} />
            Agregar rápido
          </h2>
          <p className="mt-1 text-sm text-[#60706d]">Escaneá o escribí el número de carta para sumar una copia.</p>
        </div>
        <button className="skeuo-primary flex items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={openCamera}>
          <Camera size={17} />
          Escanear
        </button>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          addByNumber(manualNumber);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-md border border-[#c9d2cd] bg-[#e8edf0] px-3 py-2 uppercase outline-none shadow-inner focus:border-[#127d84]"
          value={manualNumber}
          onChange={(event) => setManualNumber(event.target.value)}
          placeholder="EX7-004, BT1-010, P-038..."
          disabled={disabled}
        />
        <button className="skeuo-button rounded-md px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled || manualNumber.trim().length === 0}>
          +1 copia
        </button>
      </form>

      {scanStatus && <p className="rounded-md bg-[#dfe7ea] px-3 py-2 text-sm font-semibold text-[#1b2424] shadow-inner">{scanStatus}</p>}

      {isCameraOpen && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 p-0 sm:place-items-center sm:p-4">
          <section className="skeuo-card max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-md p-4 sm:rounded-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Scanner de carta</h2>
                <p className="mt-1 text-sm text-[#60706d]">Alineá la parte inferior de la carta y evitá reflejos en sleeves.</p>
              </div>
              <button className="skeuo-button grid h-10 w-10 place-items-center rounded-md" onClick={stopCamera} title="Cerrar scanner">
                <X size={18} />
              </button>
            </div>

            <div className="relative mt-4 overflow-hidden rounded-md bg-black">
              <video ref={videoRef} className="aspect-[3/4] w-full object-cover" muted playsInline autoPlay />
              <div className="pointer-events-none absolute inset-x-5 bottom-8 h-24 rounded border-2 border-[#f4c430] shadow-[0_0_0_999px_rgba(0,0,0,0.22)]" />
              {isTorchSupported && (
                <button
                  className={`absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full shadow-lg transition-colors ${isTorchOn ? "bg-[#f4c430] text-black" : "bg-black/50 text-white"}`}
                  onClick={toggleTorch}
                  title={isTorchOn ? "Apagar flash" : "Encender flash"}
                >
                  {isTorchOn ? <ZapOff size={18} /> : <Zap size={18} />}
                </button>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            {pendingCard ? (
              <div className="mt-4 flex items-center gap-4 rounded-md border-2 border-[#f4c430] bg-[#fffbe8] p-3 shadow-inner">
                {pendingCard.imageUrl && (
                  <img src={pendingCard.imageUrl} alt={pendingCard.name} className="h-20 w-14 flex-shrink-0 rounded object-cover shadow" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{pendingCard.name}</p>
                  <p className="text-sm text-[#60706d]">{pendingCard.cardNumber} · {pendingCard.setName}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="skeuo-primary flex-1 rounded-md px-3 py-2 text-sm font-semibold text-white"
                      onClick={() => {
                        onAddCard(pendingCard);
                        setScanStatus(`${pendingCard.name} ${pendingCard.cardNumber} +1 a tu colección.`);
                        setPendingCard(null);
                      }}
                    >
                      Confirmar +1
                    </button>
                    <button
                      className="skeuo-button rounded-md px-3 py-2 text-sm font-semibold"
                      onClick={() => setPendingCard(null)}
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button className="skeuo-primary flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={isScanning} onClick={scanFrame}>
                  <ScanLine size={17} />
                  {isScanning ? "Leyendo..." : "Leer número"}
                </button>
                <button className="skeuo-button rounded-md px-4 py-3 font-semibold" onClick={stopCamera}>
                  Cerrar
                </button>
              </div>
            )}

            {detectedText && (
              <details className="mt-3 text-sm text-[#60706d]">
                <summary className="cursor-pointer font-semibold">Texto detectado</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-[#dfe7ea] p-3 text-xs shadow-inner">{detectedText}</pre>
              </details>
            )}
          </section>
        </div>
      )}
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

function QuantityStepper({
  value,
  onChange,
  label,
  maxValue = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  maxValue?: number;
}) {
  const options = Array.from({ length: Math.max(maxValue, value) + 1 }, (_value, index) => index);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-[#60706d]">{label}</span>
      <button
        className="skeuo-button grid h-8 w-8 place-items-center rounded-md disabled:cursor-not-allowed disabled:opacity-45"
        title="Reducir"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(value - 1, 0))}
      >
        <Minus size={15} />
      </button>
      <select className="h-8 rounded-md border border-[#b99d76] bg-[#fff9ed] px-2 shadow-inner" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        className="skeuo-button grid h-8 w-8 place-items-center rounded-md disabled:cursor-not-allowed disabled:opacity-45"
        title={value >= maxValue ? "Limite alcanzado" : "Aumentar"}
        disabled={value >= maxValue}
        onClick={() => onChange(value + 1)}
      >
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

function DeckLibrary({
  decks,
  stats,
  cardsByNumber,
  onOpen,
}: {
  decks: Deck[];
  stats: ReturnType<typeof getDeckStats>[];
  cardsByNumber: Map<string, DigimonCard>;
  onOpen: (deckId: string) => void;
}) {
  if (decks.length === 0) {
    return <EmptyState title="Sin decks" detail="Creá tu primer deck para ver la biblioteca acá." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Tus decks</h2>
        <p className="text-sm text-[#60706d]">Elegí una lista para abrirla completa o editarla.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {decks.map((deck, index) => {
          const deckCards = splitDeckCards(deck, cardsByNumber);
          const cover = getDeckCoverCard(deck, deckCards.all, cardsByNumber);
          const deckStats = stats[index];

          return (
            <button
              key={deck.id}
              className="card-sleeve relative min-h-48 overflow-hidden rounded-md bg-[#1b2424] p-4 text-left text-white"
              onClick={() => onOpen(deck.id)}
              style={{
                backgroundImage: cover
                  ? `linear-gradient(180deg, rgba(20,28,32,0.16), rgba(20,28,32,0.9)), url(${cover.imageUrl})`
                  : "linear-gradient(135deg, #127d84, #1b2424)",
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            >
              <span className="rounded bg-black/55 px-2 py-1 text-xs font-bold shadow-sm">{deck.isPublic === false ? "Privado" : "Público"}</span>
              <span className="absolute bottom-4 left-4 right-4">
                <span className="block truncate text-xl font-bold">{deck.name}</span>
                <span className="mt-1 block text-sm text-white/82">
                  {deckStats.totalCards} cartas · {deckStats.missingCopies === 0 ? "Completo" : `${deckStats.missingCopies} copias faltantes`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeckEditorHeader({
  deck,
  coverCard,
  stats,
  priceStats,
  isEditing,
  onDescriptionChange,
  onPublicChange,
  onDelete,
}: {
  deck: Deck;
  coverCard?: DigimonCard;
  stats: ReturnType<typeof getDeckStats>;
  priceStats: ReturnType<typeof getDeckPriceStats>;
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
          <p className="mt-2 min-h-12 rounded-md border border-[#d2dde1] bg-[#dfe7ea] px-3 py-2 text-sm leading-6 text-[#1b2424] shadow-inner">
            {deck.description || "Sin descripción."}
          </p>
        )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Cartas distintas" value={deck.cards.length.toString()} detail="en la lista" />
        <Metric label="Faltan distintas" value={stats.missingDistinct.toString()} detail="cartas no completas" />
        <Metric label="Faltan copias" value={stats.missingCopies.toString()} detail="total requerido" />
        <Metric label="Precio deck" value={formatKnownMoney(priceStats.totalValue, priceStats.pricedCards > 0)} detail="estimado" />
        <Metric label="Precio faltantes" value={formatKnownMoney(priceStats.missingValue, priceStats.pricedCards > 0)} detail="para completar" />
        <Metric label="Precios cargados" value={priceStats.pricedCards.toString()} detail="cartas distintas" />
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
        <div className="mt-3 rounded-md bg-[#dfe7ea] p-3 text-sm shadow-inner">
          <p className="font-semibold">
            {result.importedLines} líneas importadas · {result.importedCopies} copias agregadas
          </p>
          {result.notFound.length > 0 && (
            <p className="mt-2 text-[#b14d19]">No encontré: {result.notFound.slice(0, 6).join(", ")}</p>
          )}
          {result.ignored.length > 0 && (
            <p className="mt-2 text-[#60706d]">Ignoradas: {result.ignored.slice(0, 4).join(" | ")}</p>
          )}
          {result.limited.length > 0 && (
            <p className="mt-2 text-[#b14d19]">Limitadas: {result.limited.slice(0, 6).join(" | ")}</p>
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
  cardPrices,
  getMaxQuantity,
  onChange,
  onOpen,
  coverCardNumber,
  isEditing,
  onSetCover,
}: {
  title: string;
  items: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }>;
  ownedByCardNumber: CollectionMap;
  cardPrices: CardPriceMap;
  getMaxQuantity: (cardNumber: string) => number;
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
            price={cardPrices[normalizeCardNumber(item.cardNumber)]?.marketPrice ?? null}
            maxQuantity={getMaxQuantity(item.cardNumber)}
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
  price,
  maxQuantity,
  onOpen,
  onChange,
  isCover,
  isEditing,
  onSetCover,
}: {
  card: DigimonCard;
  required: number;
  owned: number;
  price: number | null;
  maxQuantity: number;
  onOpen: () => void;
  onChange: (quantity: number) => void;
  isCover: boolean;
  isEditing: boolean;
  onSetCover: () => void;
}) {
  const missing = Math.max(required - owned, 0);
  const requiredValue = price === null ? null : price * required;
  const missingValue = price === null ? null : price * missing;

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
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#1d5fa8]">
          <span>{price === null ? "Precio pendiente" : `${formatMoney(price)} c/u`}</span>
          <span>Total: {formatKnownMoney(requiredValue, price !== null)}</span>
          <span>Faltantes: {formatKnownMoney(missingValue, price !== null && missing > 0)}</span>
        </div>
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
          <QuantityStepper value={required} onChange={onChange} label="Deck" maxValue={maxQuantity} />
        </div>
      )}
    </article>
  );
}

function CompactDeckList({
  groups,
  ownedByCardNumber,
  cardPrices,
  coverCardNumber,
  isEditing,
  onOpen,
  onSetCover,
}: {
  groups: Array<{ title: string; items: Array<{ cardNumber: string; card: DigimonCard; quantityRequired: number }> }>;
  ownedByCardNumber: CollectionMap;
  cardPrices: CardPriceMap;
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
                price={cardPrices[normalizeCardNumber(item.cardNumber)]?.marketPrice ?? null}
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
  price,
  isCover,
  isEditing,
  onOpen,
  onSetCover,
}: {
  item: { cardNumber: string; card: DigimonCard; quantityRequired: number };
  owned: number;
  price: number | null;
  isCover: boolean;
  isEditing: boolean;
  onOpen: () => void;
  onSetCover: () => void;
}) {
  const missing = Math.max(item.quantityRequired - owned, 0);
  const missingValue = price === null ? null : price * missing;

  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[#dfe7ea]">
      <span className="font-semibold text-[#1d5fa8]">{item.quantityRequired}</span>
      <button className="truncate text-left font-semibold" onClick={onOpen}>
        {item.card.name}
        <span className="ml-1 text-[10px] font-normal text-[#60706d]">{item.card.cardNumber}</span>
      </button>
      <span className={`h-2.5 w-2.5 rounded-full ${missing === 0 ? "bg-[#187a45]" : "bg-[#d9534f]"}`} title={missing === 0 ? "Completa" : `Falta ${missing}`} />
      <span className="text-xs font-semibold text-[#1d5fa8]" title={missing > 0 ? `Faltantes: ${formatKnownMoney(missingValue, price !== null)}` : "Sin faltantes"}>
        {price === null ? "-" : formatMoney(price)}
      </span>
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

function AddDeckCardTile({
  card,
  required,
  owned,
  price,
  maxQuantity,
  onChange,
}: {
  card: DigimonCard;
  required: number;
  owned: number;
  price: number | null;
  maxQuantity: number;
  onChange: (quantity: number) => void;
}) {
  const isBlocked = maxQuantity <= 0 && required <= 0;

  return (
    <article className={`skeuo-card grid grid-cols-[64px_1fr] gap-3 rounded-md p-3 ${isBlocked ? "opacity-60" : ""}`}>
      <div className="card-sleeve rounded-md p-1">
        <img className="aspect-[5/7] rounded object-cover" src={card.imageUrl} alt={card.name} loading="lazy" />
      </div>
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{card.name}</h3>
        <p className="text-sm text-[#60706d]">
          {card.cardNumber} · Tengo {owned}
        </p>
        {price !== null && <p className="mt-1 text-xs font-semibold text-[#1d5fa8]">{formatMoney(price)}</p>}
        <div className="mt-2">
          <QuantityStepper value={required} onChange={onChange} label="Deck" maxValue={maxQuantity} />
        </div>
        {isBlocked && <p className="mt-1 text-xs font-semibold text-[#b14d19]">Limite del deck alcanzado</p>}
      </div>
    </article>
  );
}

function CardDetail({
  card,
  owned,
  price,
  onClose,
  onSetOwned,
}: {
  card: DigimonCard;
  owned: number;
  price: number | null;
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
            <Info label="Precio estimado" value={price === null ? "Pendiente" : formatMoney(price)} />
            <div>
              <p className="text-sm font-semibold text-[#60706d]">Cantidad en mi colección</p>
              <div className="mt-2">
                <QuantityStepper value={owned} onChange={onSetOwned} label="Tengo" />
              </div>
            </div>
            {card.effect && (
              <p className="rounded-md bg-[#dfe7ea] p-3 text-sm leading-7 shadow-inner">
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

function getDeckPriceStats(deck: Deck, ownedByCardNumber: CollectionMap, cardPrices: CardPriceMap) {
  return deck.cards.reduce(
    (stats, deckCard) => {
      const cardNumber = normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId);
      const unitPrice = cardPrices[cardNumber]?.marketPrice ?? null;
      if (unitPrice === null) return stats;

      const owned = ownedByCardNumber[cardNumber] ?? 0;
      const missing = Math.max(deckCard.quantityRequired - owned, 0);

      return {
        totalValue: stats.totalValue + unitPrice * deckCard.quantityRequired,
        missingValue: stats.missingValue + unitPrice * missing,
        pricedCards: stats.pricedCards + 1,
      };
    },
    { totalValue: 0, missingValue: 0, pricedCards: 0 },
  );
}

function getCollectionValue(collection: CollectionMap, cardsById: Map<string, DigimonCard>, cardPrices: CardPriceMap) {
  return Object.entries(collection).reduce((sum, [cardId, quantity]) => {
    const card = cardsById.get(cardId);
    const cardNumber = normalizeCardNumber(card?.cardNumber ?? cardId);
    return sum + (cardPrices[cardNumber]?.marketPrice ?? 0) * quantity;
  }, 0);
}

function getPricedCardNumbers(decks: Deck[], publicDecks: Deck[], collectionCards: DigimonCard[]) {
  const cardNumbers = new Set<string>();

  for (const card of collectionCards) {
    cardNumbers.add(normalizeCardNumber(card.cardNumber));
  }

  for (const deck of [...decks, ...publicDecks]) {
    for (const deckCard of deck.cards) {
      cardNumbers.add(normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId));
    }
  }

  return Array.from(cardNumbers).sort();
}

function formatMoney(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function formatKnownMoney(value: number | null | undefined, hasPrice: boolean, currency = "USD") {
  if (!hasPrice) return "Pendiente";
  return formatMoney(value, currency);
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

function getAllowedDeckQuantity(deck: Deck, cardNumber: string, requestedQuantity: number, cardsByNumber: Map<string, DigimonCard>) {
  const normalizedCardNumber = normalizeCardNumber(cardNumber);
  const existingQuantity =
    deck.cards.find((deckCard) => normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId) === normalizedCardNumber)
      ?.quantityRequired ?? 0;
  const isEgg = isDigiEggCard(cardNumber, cardsByNumber);
  const zoneCount = getDeckZoneCount(deck.cards, isEgg, cardsByNumber);
  const zoneLimit = isEgg ? maxEggDeckCards : maxMainDeckCards;
  const availableForCard = Math.max(zoneLimit - zoneCount + existingQuantity, 0);

  return Math.min(Math.max(requestedQuantity, 0), maxDeckQuantity, availableForCard);
}

function enforceDeckLimits(deckCards: Deck["cards"], cardsByNumber: Map<string, DigimonCard>) {
  const mainCards: Deck["cards"] = [];
  const eggCards: Deck["cards"] = [];
  let mainCount = 0;
  let eggCount = 0;

  for (const deckCard of deckCards) {
    const isEgg = isDigiEggCard(deckCard.cardNumber ?? deckCard.cardId, cardsByNumber);
    const zoneLimit = isEgg ? maxEggDeckCards : maxMainDeckCards;
    const zoneCount = isEgg ? eggCount : mainCount;
    const allowedQuantity = Math.min(deckCard.quantityRequired, maxDeckQuantity, Math.max(zoneLimit - zoneCount, 0));
    if (allowedQuantity <= 0) continue;

    const nextCard = { ...deckCard, quantityRequired: allowedQuantity };
    if (isEgg) {
      eggCards.push(nextCard);
      eggCount += allowedQuantity;
    } else {
      mainCards.push(nextCard);
      mainCount += allowedQuantity;
    }
  }

  return [...mainCards, ...eggCards];
}

function getDeckLimitMessages(currentCards: Deck["cards"], importedCards: Deck["cards"], cardsByNumber: Map<string, DigimonCard>) {
  const before = enforceDeckLimits(currentCards, cardsByNumber);
  const merged = new Map(before.map((deckCard) => [normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId), deckCard]));

  for (const importedCard of importedCards) {
    merged.set(normalizeCardNumber(importedCard.cardNumber ?? importedCard.cardId), importedCard);
  }

  const requested = Array.from(merged.values());
  const limited = enforceDeckLimits(requested, cardsByNumber);
  const limitedByNumber = new Map(limited.map((deckCard) => [normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId), deckCard.quantityRequired]));

  return requested
    .filter((deckCard) => (limitedByNumber.get(normalizeCardNumber(deckCard.cardNumber ?? deckCard.cardId)) ?? 0) < deckCard.quantityRequired)
    .map((deckCard) => `${deckCard.cardNumber ?? deckCard.cardId} limitado por máximo de deck`);
}

function getDeckZoneCount(deckCards: Deck["cards"], isEggZone: boolean, cardsByNumber: Map<string, DigimonCard>) {
  return deckCards.reduce((sum, deckCard) => {
    const isEgg = isDigiEggCard(deckCard.cardNumber ?? deckCard.cardId, cardsByNumber);
    return isEgg === isEggZone ? sum + deckCard.quantityRequired : sum;
  }, 0);
}

function isDigiEggCard(cardNumber: string, cardsByNumber: Map<string, DigimonCard>) {
  return cardsByNumber.get(normalizeCardNumber(cardNumber))?.type === "Digi-Egg";
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

function applyThreshold(context: CanvasRenderingContext2D, width: number, height: number, threshold: number, invert: boolean) {
  const image = context.getImageData(0, 0, width, height);

  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index] ?? 0;
    const green = image.data[index + 1] ?? 0;
    const blue = image.data[index + 2] ?? 0;
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    let value = luminance > threshold ? 255 : 0;
    if (invert) value = 255 - value;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }

  context.putImageData(image, 0, 0);
}

function extractCardNumber(text: string) {
  const normalizedText = text
    .toUpperCase()
    .replace(/[|]/g, "I")
    .replace(/[—–_./]/g, "-")
    .replace(/\s+/g, " ");

  const match = normalizedText.match(/\b((?:P|LM)\s*-?\s*[0-9OQISL]{2,3}|[A-Z]{2,3}\s*-?\s*[0-9OQISL]{1,2}\s*-?\s*[0-9OQISL]{2,3})\b/);
  if (!match?.[1]) return "";

  const compact = match[1].replace(/\s+/g, "").replace(/--+/g, "-");
  const promoMatch = compact.match(/^(P|LM)-?([0-9OQISL]{2,3})$/);
  if (promoMatch) return `${promoMatch[1]}-${cleanOcrDigits(promoMatch[2])}`;

  const standardMatch = compact.match(/^([A-Z]{2,3})-?([0-9OQISL]{1,2})-?([0-9OQISL]{2,3})$/);
  if (!standardMatch) return compact;

  return `${standardMatch[1]}${Number(cleanOcrDigits(standardMatch[2]))}-${cleanOcrDigits(standardMatch[3])}`;
}

function cleanOcrDigits(value: string) {
  return value
    .replace(/[OQ]/g, "0")
    .replace(/[ISL]/g, "1");
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
