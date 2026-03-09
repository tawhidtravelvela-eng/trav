import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import ProtectedAdminRoute from "@/components/auth/ProtectedAdminRoute";
import Index from "./pages/Index";
import Flights from "./pages/Flights";
import FlightDetail from "./pages/FlightDetail";
import FlightBooking from "./pages/FlightBooking";
import Hotels from "./pages/Hotels";
import HotelDetail from "./pages/HotelDetail";
import HotelBooking from "./pages/HotelBooking";
import BookingConfirmation from "./pages/BookingConfirmation";
import BookingPayment from "./pages/BookingPayment";
import ETicket from "./pages/ETicket";
import Tours from "./pages/Tours";
import TourDetail from "./pages/TourDetail";
import TourBooking from "./pages/TourBooking";
import TourInquiry from "./pages/TourInquiry";
import ViatorTourDetail from "./pages/ViatorTourDetail";
import ViatorTourBooking from "./pages/ViatorTourBooking";
import Auth from "./pages/Auth";
import RegisterCorporate from "./pages/RegisterCorporate";
import RegisterAgent from "./pages/RegisterAgent";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminBookings from "./pages/admin/AdminBookings";
import AdminFlights from "./pages/admin/AdminFlights";
import AdminHotels from "./pages/admin/AdminHotels";
import AdminTours from "./pages/admin/AdminTours";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminContent from "./pages/admin/AdminContent";
import AdminApiSettings from "./pages/admin/AdminApiSettings";
import AdminMarkups from "./pages/admin/AdminMarkups";
import AdminAirlineSettings from "./pages/admin/AdminAirlineSettings";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminBlog from "./pages/admin/AdminBlog";
import AdminQueueDashboard from "./pages/admin/AdminQueueDashboard";
import AdminPopularRoutes from "./pages/admin/AdminPopularRoutes";
import TermsAndConditions from "./pages/TermsAndConditions";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import RefundPolicy from "./pages/RefundPolicy";
import AdminTerms from "./pages/admin/AdminTerms";
import AdminPrivacyPolicy from "./pages/admin/AdminPrivacyPolicy";
import AdminRefundPolicy from "./pages/admin/AdminRefundPolicy";
import AdminTicketRequests from "./pages/admin/AdminTicketRequests";
import AdminHomepage from "./pages/admin/AdminHomepage";
import AdminTenants from "./pages/admin/AdminTenants";
import AdminTenantApiSettings from "./pages/admin/AdminTenantApiSettings";
import AdminUserApprovals from "./pages/admin/AdminUserApprovals";
import AdminTenantPaymentSettings from "./pages/admin/AdminTenantPaymentSettings";
import AdminAccounting from "./pages/admin/AdminAccounting";

const queryClient = new QueryClient();

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedAdminRoute>{children}</ProtectedAdminRoute>
);

const AppContent = () => {
  useThemeColors();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/flights" element={<Flights />} />
        <Route path="/flights/:id" element={<FlightDetail />} />
        <Route path="/flights/:id/book" element={<FlightBooking />} />
        <Route path="/hotels" element={<Hotels />} />
        <Route path="/hotels/:id" element={<HotelDetail />} />
        <Route path="/hotels/:id/book" element={<HotelBooking />} />
        <Route path="/booking/confirmation" element={<BookingConfirmation />} />
        <Route path="/booking/ticket/:id" element={<ETicket />} />
        <Route path="/booking/pay/:id" element={<BookingPayment />} />
        <Route path="/tours" element={<Tours />} />
        <Route path="/tours/:id" element={<TourDetail />} />
        <Route path="/tours/viator/:productCode" element={<ViatorTourDetail />} />
        <Route path="/tours/viator/:productCode/book" element={<ViatorTourBooking />} />
        <Route path="/tours/:id/book" element={<TourBooking />} />
        <Route path="/tours/:id/inquiry" element={<TourInquiry />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/register/corporate" element={<RegisterCorporate />} />
        <Route path="/register/agent" element={<RegisterAgent />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/bookings" element={<AdminRoute><AdminBookings /></AdminRoute>} />
        <Route path="/admin/flights" element={<AdminRoute><AdminFlights /></AdminRoute>} />
        <Route path="/admin/hotels" element={<AdminRoute><AdminHotels /></AdminRoute>} />
        <Route path="/admin/tours" element={<AdminRoute><AdminTours /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/content" element={<AdminRoute><AdminContent /></AdminRoute>} />
        <Route path="/admin/api-settings" element={<AdminRoute><AdminApiSettings /></AdminRoute>} />
        <Route path="/admin/markups" element={<AdminRoute><AdminMarkups /></AdminRoute>} />
        <Route path="/admin/airline-settings" element={<AdminRoute><AdminAirlineSettings /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
        <Route path="/admin/blog" element={<AdminRoute><AdminBlog /></AdminRoute>} />
        <Route path="/admin/queues" element={<AdminRoute><AdminQueueDashboard /></AdminRoute>} />
        <Route path="/admin/popular-routes" element={<AdminRoute><AdminPopularRoutes /></AdminRoute>} />
        <Route path="/admin/terms" element={<AdminRoute><AdminTerms /></AdminRoute>} />
        <Route path="/admin/privacy-policy" element={<AdminRoute><AdminPrivacyPolicy /></AdminRoute>} />
        <Route path="/admin/refund-policy" element={<AdminRoute><AdminRefundPolicy /></AdminRoute>} />
        <Route path="/admin/ticket-requests" element={<AdminRoute><AdminTicketRequests /></AdminRoute>} />
        <Route path="/admin/homepage" element={<AdminRoute><AdminHomepage /></AdminRoute>} />
        <Route path="/admin/tenants" element={<AdminRoute><AdminTenants /></AdminRoute>} />
        <Route path="/admin/tenant-api" element={<AdminRoute><AdminTenantApiSettings /></AdminRoute>} />
        <Route path="/admin/user-approvals" element={<AdminRoute><AdminUserApprovals /></AdminRoute>} />
        <Route path="/admin/tenant-payment" element={<AdminRoute><AdminTenantPaymentSettings /></AdminRoute>} />
        <Route path="/admin/accounting" element={<AdminRoute><AdminAccounting /></AdminRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CurrencyProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppContent />
      </TooltipProvider>
      </CurrencyProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
