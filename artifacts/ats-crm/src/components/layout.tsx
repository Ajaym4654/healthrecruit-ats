import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, 
  Users, 
  Trello, 
  Search, 
  Upload, 
  Copy,
  LogOut,
  Building
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 border-b flex items-center px-4 shrink-0 bg-card">
            <SidebarTrigger />
          </header>
          <div className="flex-1 overflow-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { data: user } = useGetMe();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
      }
    });
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Users, label: "Candidates", href: "/candidates" },
    { icon: Trello, label: "Pipeline", href: "/pipeline" },
    { icon: Search, label: "Search", href: "/search" },
    { icon: Upload, label: "Import", href: "/import" },
    { icon: Copy, label: "Duplicates", href: "/duplicates" },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="h-14 flex items-center px-4 shrink-0 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-semibold text-sidebar-foreground">
          <div className="size-8 bg-sidebar-primary rounded flex items-center justify-center text-sidebar-primary-foreground">
            <Building className="size-4" />
          </div>
          <span className="truncate">HealthRecruit</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="mt-4 px-2">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton 
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium truncate">
            {user?.username || "Admin User"}
          </div>
          <button 
            onClick={handleLogout}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
