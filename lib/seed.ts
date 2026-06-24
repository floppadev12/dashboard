import type { DashboardData } from "@/lib/types";

export const dashboardData: DashboardData = {
  games: [],
  live: [
    { label: "00:00", players: 38, sessions: 20, revenue: 12 },
    { label: "02:00", players: 48, sessions: 29, revenue: 18 },
    { label: "04:00", players: 66, sessions: 34, revenue: 24 },
    { label: "06:00", players: 52, sessions: 31, revenue: 22 },
    { label: "08:00", players: 72, sessions: 42, revenue: 29 },
    { label: "10:00", players: 83, sessions: 52, revenue: 34 },
    { label: "12:00", players: 55, sessions: 39, revenue: 25 },
    { label: "14:00", players: 78, sessions: 48, revenue: 31 },
    { label: "16:00", players: 62, sessions: 41, revenue: 27 },
    { label: "18:00", players: 76, sessions: 53, revenue: 32 },
    { label: "20:00", players: 51, sessions: 37, revenue: 24 },
    { label: "22:00", players: 60, sessions: 43, revenue: 26 }
  ],
  timeline: [
    { label: "Apr 20", players: 3200, revenue: 12000, sessions: 12000 },
    { label: "Apr 22", players: 4300, revenue: 26000, sessions: 14200 },
    { label: "Apr 24", players: 6500, revenue: 41000, sessions: 17800 },
    { label: "Apr 27", players: 4700, revenue: 36000, sessions: 15100 },
    { label: "Apr 30", players: 6900, revenue: 53000, sessions: 20500 },
    { label: "May 4", players: 3900, revenue: 35000, sessions: 16200 },
    { label: "May 7", players: 5100, revenue: 43000, sessions: 18800 },
    { label: "May 11", players: 8600, revenue: 72000, sessions: 24100 },
    { label: "May 14", players: 7600, revenue: 69000, sessions: 22900 },
    { label: "May 18", players: 6700, revenue: 85200, sessions: 24102 }
  ],
  metrics: [
    { label: "Players Online", value: "6,700", change: "+12.5%", tone: "purple" },
    { label: "Active Sessions", value: "24,102", change: "+8.3%", tone: "blue" },
    { label: "Avg. Session Time", value: "18m 42s", change: "+6.1%", tone: "green" }
  ],
  niches: [
    { label: "Table", value: 33, icon: "Table", color: "#ff9f32" },
    { label: "+1", value: 26, icon: "+1", color: "#ef3d75" },
    { label: "RNG", value: 18, icon: "RNG", color: "#8b5cff" },
    { label: "Tower", value: 13, icon: "Tow", color: "#4693ff" },
    { label: "Co op", value: 10, icon: "Co", color: "#6146ff" }
  ],
  devices: [
    { label: "PC", value: 46, color: "#9b4dff" },
    { label: "Mobile", value: 38, color: "#6b2cff" },
    { label: "Console", value: 12, color: "#d8d58d" },
    { label: "Other", value: 4, color: "#5b4a8f" }
  ],
  alerts: [
    { title: "High Server Load", body: "Server load is above 85% for the last 15 minutes.", time: "5m ago", severity: "High", tone: "purple" },
    { title: "Revenue Drop Detected", body: "Revenue has dropped by 18% compared to yesterday.", time: "27m ago", severity: "Medium", tone: "orange" },
    { title: "Payment Failures Spike", body: "Payment failure rate is above 5%.", time: "1h ago", severity: "Medium", tone: "yellow" }
  ]
};
