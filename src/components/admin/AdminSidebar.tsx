import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Plane,
  Building2,
  Map,
  CalendarCheck,
  Users,
  LogOut,
  FileText,
  Settings,
  Percent,
  Luggage,
  PenSquare,
  ChevronDown,
  ChevronRight,
  Search,
  Paintbrush,
  Bell,
  Share2,
  Phone,
  BarChart3,
  Wallet,
  BarChart,
  Headphones,
  Globe,
  CreditCard,
  Grid3X3,
  RefreshCw,
  Info,
  ListOrdered,
  LayoutTemplate,
  Key,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

// Items visible only to super admins (no tenant_id)
const superAdminOnlyUrls = new Set([
  "/admin/flights",
  "/admin/hotels",
  "/admin/tours",
  "/admin/airline-settings",
  "/admin/api-settings",
  "/admin/queues",
  "/admin/popular-routes",
  "/admin/tenants",
]);

const allMenuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Bookings", url: "/admin/bookings", icon: CalendarCheck },
  { title: "Ticket Requests", url: "/admin/ticket-requests", icon: RefreshCw },
  { title: "Flights", url: "/admin/flights", icon: Plane },
  { title: "Hotels", url: "/admin/hotels", icon: Building2 },
  { title: "Tours", url: "/admin/tours", icon: Map },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Content", url: "/admin/content", icon: FileText },
  { title: "Homepage", url: "/admin/homepage", icon: LayoutTemplate },
  { title: "Blog", url: "/admin/blog", icon: PenSquare },
  { title: "Markups", url: "/admin/markups", icon: Percent },
  { title: "Airline Settings", url: "/admin/airline-settings", icon: Luggage },
  { title: "API Settings", url: "/admin/api-settings", icon: Globe },
  { title: "Queue Manager", url: "/admin/queues", icon: ListOrdered },
  { title: "Popular Routes", url: "/admin/popular-routes", icon: BarChart },
  { title: "Terms & Conditions", url: "/admin/terms", icon: FileText },
  { title: "Privacy Policy", url: "/admin/privacy-policy", icon: FileText },
  { title: "Refund Policy", url: "/admin/refund-policy", icon: FileText },
  { title: "Tenants", url: "/admin/tenants", icon: Globe },
  { title: "User Approvals", url: "/admin/user-approvals", icon: Users },
  { title: "Accounting", url: "/admin/accounting", icon: Wallet },
];

const settingsSubItems = [
  { title: "General", url: "/admin/settings?tab=general", icon: Settings },
  { title: "SEO", url: "/admin/settings?tab=seo", icon: Search },
  { title: "Branding", url: "/admin/settings?tab=branding", icon: Paintbrush },
  { title: "Notifications", url: "/admin/settings?tab=notifications", icon: Bell },
  { title: "Social Media", url: "/admin/settings?tab=social", icon: Share2 },
  { title: "Contact", url: "/admin/settings?tab=contact", icon: Phone },
  { title: "Tracking", url: "/admin/settings?tab=tracking", icon: BarChart3 },
  { title: "Apps", url: "/admin/settings?tab=apps", icon: Grid3X3 },
  { title: "Booking Options", url: "/admin/settings?tab=booking", icon: CalendarCheck },
  { title: "Payment Gateways", url: "/admin/settings?tab=payment", icon: CreditCard },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();
  const { adminTenantId } = useAuth();
  const isSuperAdmin = !adminTenantId;
  const isSettingsActive = location.pathname.startsWith("/admin/settings");

  // Build menu: tenant admins get "Your API Settings" instead of global ones
  const mainMenuItems = isSuperAdmin
    ? allMenuItems
    : [
        ...allMenuItems.filter(item => !superAdminOnlyUrls.has(item.url)),
        { title: "Your API Settings", url: "/admin/tenant-api", icon: Key },
        { title: "Payment Settings", url: "/admin/tenant-payment", icon: CreditCard },
      ];

  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            {!collapsed && "Admin Panel"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-semibold"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings group */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    if (collapsed) {
                      navigate("/admin/settings?tab=general");
                    } else {
                      setSettingsOpen(!settingsOpen);
                    }
                  }}
                  className={`hover:bg-muted/50 ${isSettingsActive ? "bg-primary/10 text-primary font-semibold" : ""}`}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">Settings</span>
                      {settingsOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {!collapsed && settingsOpen && (
                <>
                  {settingsSubItems.map((item) => {
                    const tabParam = new URL(item.url, "http://x").searchParams.get("tab");
                    const currentTab = new URLSearchParams(location.search).get("tab") || "general";
                    const isActive = isSettingsActive && currentTab === tabParam;

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`pl-8 ${isActive ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"}`}
                        >
                          <a
                            href={item.url}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(item.url);
                            }}
                          >
                            <item.icon className="mr-2 h-4 w-4" />
                            <span>{item.title}</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/")}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Back to Site"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
