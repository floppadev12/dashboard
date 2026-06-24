export type ChartPoint = {
  label: string;
  players: number;
  revenue: number;
  sessions: number;
};

export type GameCard = {
  id: string;
  title: string;
  link: string;
  linkUpdatedAt?: number;
  thumbnail: string;
  groupName: string;
  arpdau: string;
  ccu: number;
  visits: number;
  addedAt?: string;
  createdAt?: string;
  universeId?: number;
  nicheId?: string;
  online: boolean;
};

export type Metric = {
  label: string;
  value: string;
  change: string;
  tone: "purple" | "blue" | "green";
};

export type Niche = {
  id?: string;
  label: string;
  value: number;
  icon: string;
  iconImage?: string;
  color: string;
};

export type Device = {
  label: string;
  value: number;
  color: string;
};

export type Alert = {
  title: string;
  body: string;
  time: string;
  severity: "High" | "Medium";
  tone: "purple" | "orange" | "yellow";
};

export type DashboardData = {
  games: GameCard[];
  timeline: ChartPoint[];
  live: ChartPoint[];
  metrics: Metric[];
  niches: Niche[];
  devices: Device[];
  alerts: Alert[];
};
