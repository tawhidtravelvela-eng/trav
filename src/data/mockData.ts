export const destinations = [
  { id: 1, name: "Paris", country: "France", image: "dest-paris", price: 499, rating: 4.8, flights: 120 },
  { id: 2, name: "Tokyo", country: "Japan", image: "dest-tokyo", price: 799, rating: 4.9, flights: 85 },
  { id: 3, name: "Bali", country: "Indonesia", image: "dest-bali", price: 599, rating: 4.7, flights: 65 },
  { id: 4, name: "Dubai", country: "UAE", image: "dest-dubai", price: 449, rating: 4.6, flights: 150 },
  { id: 5, name: "Santorini", country: "Greece", image: "dest-santorini", price: 699, rating: 4.9, flights: 40 },
  { id: 6, name: "New York", country: "USA", image: "dest-newyork", price: 349, rating: 4.5, flights: 200 },
];

export const flights = [
  { id: 1, airline: "Emirates", from: "New York", to: "Dubai", departure: "08:00", arrival: "20:30", duration: "12h 30m", price: 849, stops: 0, class: "Economy" },
  { id: 2, airline: "Delta Airlines", from: "New York", to: "Paris", departure: "22:00", arrival: "11:30", duration: "7h 30m", price: 599, stops: 0, class: "Economy" },
  { id: 3, airline: "ANA", from: "Los Angeles", to: "Tokyo", departure: "11:45", arrival: "15:20", duration: "11h 35m", price: 989, stops: 0, class: "Economy" },
  { id: 4, airline: "Singapore Airlines", from: "London", to: "Bali", departure: "21:00", arrival: "17:45", duration: "14h 45m", price: 750, stops: 1, class: "Economy" },
  { id: 5, airline: "Turkish Airlines", from: "Chicago", to: "Santorini", departure: "17:30", arrival: "14:00", duration: "12h 30m", price: 680, stops: 1, class: "Economy" },
  { id: 6, airline: "Qatar Airways", from: "San Francisco", to: "Dubai", departure: "01:30", arrival: "05:00", duration: "15h 30m", price: 920, stops: 1, class: "Business" },
];

export const hotels = [
  { id: 1, name: "Grand Palace Hotel", city: "Paris", rating: 4.8, reviews: 2340, price: 250, image: "dest-paris", amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"], stars: 5 },
  { id: 2, name: "Tokyo Bay Resort", city: "Tokyo", rating: 4.7, reviews: 1890, price: 180, image: "dest-tokyo", amenities: ["WiFi", "Restaurant", "Bar", "Gym"], stars: 4 },
  { id: 3, name: "Bali Zen Villas", city: "Bali", rating: 4.9, reviews: 3200, price: 320, image: "dest-bali", amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Beach Access"], stars: 5 },
  { id: 4, name: "Burj View Suites", city: "Dubai", rating: 4.6, reviews: 1560, price: 400, image: "dest-dubai", amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Bar"], stars: 5 },
  { id: 5, name: "Aegean Blue Hotel", city: "Santorini", rating: 4.8, reviews: 980, price: 280, image: "dest-santorini", amenities: ["WiFi", "Pool", "Restaurant", "Sea View"], stars: 4 },
  { id: 6, name: "Manhattan Central Inn", city: "New York", rating: 4.4, reviews: 4100, price: 199, image: "dest-newyork", amenities: ["WiFi", "Restaurant", "Gym", "Bar"], stars: 4 },
];


export const testimonials = [
  { id: 1, name: "Sarah Johnson", role: "Frequent Traveler", text: "TravelGo made planning my trip to Bali incredibly easy. The hotel suggestions were spot-on and the prices were unbeatable!", rating: 5, avatar: "SJ" },
  { id: 2, name: "Michael Chen", role: "Business Traveler", text: "I use TravelGo for all my business flights. The booking process is seamless and I always find great deals on premium cabins.", rating: 5, avatar: "MC" },
  { id: 3, name: "Emma Williams", role: "Adventure Seeker", text: "The tour packages are amazing! Our Japan trip was perfectly organized with incredible local experiences. Highly recommended!", rating: 5, avatar: "EW" },
];

export const offers = [
  { id: 1, title: "Early Bird Summer Sale", description: "Book your summer vacation early and save up to 40% on flights and hotels", discount: "40% OFF", color: "primary" },
  { id: 2, title: "Weekend Getaway Deals", description: "Special weekend packages starting from just $199 per person", discount: "FROM $199", color: "accent" },
  { id: 3, title: "Honeymoon Packages", description: "Luxury honeymoon packages to Bali, Maldives & Santorini with complimentary upgrades", discount: "FREE UPGRADE", color: "success" },
];
