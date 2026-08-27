export type TournamentState = "draft" | "archived";

export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  tournamentDate: string;
  startTimeLabel: string | null;
  timezoneLabel: string | null;
  prizePoolLabel: string | null;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  state: TournamentState;
  createdAt: string;
  updatedAt: string;
};

export type TournamentDraft = Pick<
  Tournament,
  | "name"
  | "description"
  | "tournamentDate"
  | "startTimeLabel"
  | "timezoneLabel"
  | "prizePoolLabel"
  | "imageUrl"
  | "ctaLabel"
  | "ctaUrl"
>;
export type PublicTournament = Omit<
  Tournament,
  "state" | "createdAt" | "updatedAt"
>;
