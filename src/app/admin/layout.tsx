import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar role={user.role} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
