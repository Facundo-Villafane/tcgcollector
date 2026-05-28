export type CardType = "Digimon" | "Tamer" | "Option" | "Digi-Egg" | string;

export type DigimonCard = {
  id: string;
  name: string;
  cardNumber: string;
  variantLabel: string;
  isAlternateArt: boolean;
  parallelId: number;
  setCode: string;
  setName: string;
  color: string[];
  type: CardType;
  rarity: string;
  level?: number;
  playCost?: number;
  digivolveCost?: number;
  dp?: number;
  imageUrl: string;
  effect?: string;
  form?: string;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
};

export type CollectionMap = Record<string, number>;

export type DeckCard = {
  cardNumber: string;
  cardId: string;
  quantityRequired: number;
};

export type Deck = {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  coverCardNumber?: string;
  isPublic?: boolean;
  viewCount?: number;
  likeCount?: number;
  createdAt: string;
  updatedAt: string;
  cards: DeckCard[];
};
