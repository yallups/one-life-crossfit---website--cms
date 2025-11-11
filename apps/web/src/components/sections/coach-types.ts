export type WodifyCoach = {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  picture_url?: string | null;
  title?: string | null;
  biography?: string | null;
  link_1?: string | null;
  link_2?: string | null;
  link_3?: string | null;
  link_4?: string | null;
  link_5?: string | null;
  locations?: string | null; // comma-separated
  programs?: string | null; // comma-separated
  services?: string | null; // comma-separated
};
