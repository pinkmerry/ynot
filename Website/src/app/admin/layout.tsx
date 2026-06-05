import type { ReactNode } from "react";
import { requireAdminRoute } from "@/lib/auth/protected-route";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminRoute("/admin");
  return <>{children}</>;
}
