import PolicyPage from "@/components/PolicyPage";
import { useSiteBranding } from "@/hooks/useSiteBranding";

const defaultContent = (name: string) => `
<h2>1. Information We Collect</h2>
<p>${name} collects personal information such as your name, email address, phone number, and payment details when you make a booking or create an account.</p>
<h2>2. How We Use Your Information</h2>
<ul><li>To process and manage your bookings</li><li>To communicate booking confirmations and updates</li><li>To improve our services and user experience</li><li>To comply with legal obligations</li></ul>
<h2>3. Information Sharing</h2>
<p>We share your information with airlines, hotels, and tour operators solely for the purpose of fulfilling your bookings. We do not sell your personal data to third parties.</p>
<h2>4. Data Security</h2>
<p>We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, or disclosure.</p>
<h2>5. Cookies</h2>
<p>We use cookies to enhance your browsing experience and analyze site traffic. You can manage cookie preferences through your browser settings.</p>
<h2>6. Your Rights</h2>
<ul><li>Access your personal data</li><li>Request correction of inaccurate data</li><li>Request deletion of your data</li><li>Opt out of marketing communications</li></ul>
<h2>7. Contact Us</h2>
<p>For privacy-related inquiries, please contact us through our Website.</p>
`;

const PrivacyPolicy = () => {
  const { branding } = useSiteBranding();
  const siteName = branding.site_name || "Travel Vela";
  return <PolicyPage providerKey="site_privacy" pageTitle="Privacy Policy" defaultContent={defaultContent(siteName)} />;
};

export default PrivacyPolicy;
