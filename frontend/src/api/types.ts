export type TeeTime = {
  time: string;
  price: string | null;
  booking_url: string | null;
};

export type GolfClub = {
  place_id: string;
  name: string;
  address: string | null;
  website: string | null;
};

export type LocationSuggestion = {
  place_id: string;
  label: string;
};
