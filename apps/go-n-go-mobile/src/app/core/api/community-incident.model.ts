export const COMMUNITY_INCIDENT_TYPES = [
  "congestion",
  "accident",
  "road_hazard",
  "road_closure",
  "breakdown",
] as const;

export type CommunityIncidentType = (typeof COMMUNITY_INCIDENT_TYPES)[number];
export type CommunityIncidentVote = "confirm" | "clear";

export interface CommunityIncident {
  id: string;
  type: CommunityIncidentType;
  lat: number;
  lng: number;
  createdAt: string;
  expiresAt: string;
  confirmations: number;
  clears: number;
  confidence: "unconfirmed" | "community_confirmed" | "community_disputed";
  source: "community_report";
  isMine: boolean;
}

export interface CreateCommunityIncidentRequest {
  type: CommunityIncidentType;
  lat: number;
  lng: number;
}

export interface CreateCommunityIncidentResult {
  incident: CommunityIncident;
  duplicate: boolean;
}
