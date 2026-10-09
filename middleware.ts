import { NextRequest, NextResponse } from "next/server";

// Password-protects the whole dashboard. Discord and the daily cron job have their own checks.
export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? new NextResponse("Set DASHBOARD_PASSWORD to open the dashboard.", { status: 503 })
      : NextResponse.next();
  }
  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
    } catch {
      // fall through to the login prompt
    }
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="GameOps Dashboard", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/discord|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
