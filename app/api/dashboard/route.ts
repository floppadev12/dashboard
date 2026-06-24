import { NextResponse } from "next/server";
import { dashboardData } from "@/lib/seed";

export async function GET() {
  return NextResponse.json(dashboardData);
}
