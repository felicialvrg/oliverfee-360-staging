import { requireOwner as requireAdmin } from "@/lib/admin/owner";
import { redirect } from "next/navigation";

export default async function LeadsPage() {
  await requireAdmin();
  redirect('/admin/sales#assigned-leads');
}
