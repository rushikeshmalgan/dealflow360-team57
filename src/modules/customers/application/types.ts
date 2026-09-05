export type TierDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDto = {
  id: string;
  name: string;
  tier: { id: string; name: string };
  primaryContactEmail: string | null;
  createdAt: string;
  updatedAt: string;
};
