export const adminStats = {
  totalUsers: 12847,
  totalBookings: 3429,
  totalRevenue: 1284500,
  activeFlights: 156,
  activeHotels: 89,
  activeTours: 42,
};

export const monthlyData = [
  { month: "Jan", revenue: 85000, bookings: 210 },
  { month: "Feb", revenue: 92000, bookings: 245 },
  { month: "Mar", revenue: 110000, bookings: 290 },
  { month: "Apr", revenue: 98000, bookings: 268 },
  { month: "May", revenue: 125000, bookings: 320 },
  { month: "Jun", revenue: 140000, bookings: 355 },
  { month: "Jul", revenue: 155000, bookings: 390 },
  { month: "Aug", revenue: 148000, bookings: 375 },
  { month: "Sep", revenue: 118000, bookings: 310 },
  { month: "Oct", revenue: 105000, bookings: 285 },
  { month: "Nov", revenue: 95000, bookings: 250 },
  { month: "Dec", revenue: 113500, bookings: 331 },
];

export const mockBookings = [
  { id: "BK-001", user: "Sarah Johnson", email: "sarah@email.com", type: "Flight", destination: "Paris", date: "2026-03-15", amount: 599, status: "Paid" as const },
  { id: "BK-002", user: "Michael Chen", email: "michael@email.com", type: "Hotel", destination: "Tokyo", date: "2026-03-18", amount: 360, status: "Pending" as const },
  { id: "BK-003", user: "Emma Williams", email: "emma@email.com", type: "Tour", destination: "Bali", date: "2026-03-20", amount: 1599, status: "Paid" as const },
  { id: "BK-004", user: "James Wilson", email: "james@email.com", type: "Flight", destination: "Dubai", date: "2026-03-22", amount: 920, status: "Cancelled" as const },
  { id: "BK-005", user: "Lisa Brown", email: "lisa@email.com", type: "Hotel", destination: "Santorini", date: "2026-03-25", amount: 280, status: "Paid" as const },
  { id: "BK-006", user: "David Lee", email: "david@email.com", type: "Tour", destination: "New York", date: "2026-03-28", amount: 999, status: "Pending" as const },
  { id: "BK-007", user: "Anna Garcia", email: "anna@email.com", type: "Flight", destination: "Tokyo", date: "2026-04-01", amount: 989, status: "Paid" as const },
  { id: "BK-008", user: "Robert Taylor", email: "robert@email.com", type: "Hotel", destination: "Paris", date: "2026-04-05", amount: 500, status: "Pending" as const },
];

export const mockUsers = [
  { id: "U-001", name: "Sarah Johnson", email: "sarah@email.com", joinDate: "2025-08-12", bookings: 5, spent: 3200, status: "Active" as const },
  { id: "U-002", name: "Michael Chen", email: "michael@email.com", joinDate: "2025-09-03", bookings: 3, spent: 1800, status: "Active" as const },
  { id: "U-003", name: "Emma Williams", email: "emma@email.com", joinDate: "2025-10-15", bookings: 8, spent: 5600, status: "Active" as const },
  { id: "U-004", name: "James Wilson", email: "james@email.com", joinDate: "2025-11-01", bookings: 2, spent: 920, status: "Blocked" as const },
  { id: "U-005", name: "Lisa Brown", email: "lisa@email.com", joinDate: "2025-12-20", bookings: 4, spent: 2100, status: "Active" as const },
  { id: "U-006", name: "David Lee", email: "david@email.com", joinDate: "2026-01-05", bookings: 1, spent: 999, status: "Active" as const },
  { id: "U-007", name: "Anna Garcia", email: "anna@email.com", joinDate: "2026-01-18", bookings: 6, spent: 4200, status: "Active" as const },
  { id: "U-008", name: "Robert Taylor", email: "robert@email.com", joinDate: "2026-02-01", bookings: 0, spent: 0, status: "Active" as const },
];
