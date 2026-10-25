import { auth } from "@clerk/nextjs/server";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();

  return (
    <TooltipProvider>
      <SidebarProvider className="min-h-screen">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger />
            <span className="text-sm font-semibold md:hidden">
              Lua Lua Margin Engine
            </span>
          </header>
          <div className="flex-1 p-6">{children}</div>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}
