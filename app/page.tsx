import { Dashboard } from "@/components/dashboard/dashboard";
import { getDashboardData } from "@/lib/data";

export default async function Page() {
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
