import PolicyPage from "@/components/PolicyPage";
import { useSiteBranding } from "@/hooks/useSiteBranding";

const defaultContent = (name: string) => `
<h2>1. Acceptance of Terms</h2>
<p>By accessing and using ${name}, you accept and agree to be bound by these Terms and Conditions.</p>
<h2>2. Services</h2>
<p>${name} provides an online platform for searching, comparing, and booking travel services including flights, hotels, and tour packages.</p>
<h2>3. Booking and Payment</h2>
<ul><li>All bookings are subject to availability and confirmation.</li><li>Prices are subject to change until payment is completed.</li></ul>
<h2>4. Cancellation and Refunds</h2>
<ul><li>Cancellation policies vary by service provider and fare type.</li><li>Refunds will be processed per the provider's policy.</li></ul>
<h2>5. Limitation of Liability</h2>
<p>${name} acts as an intermediary and is not directly responsible for services provided by airlines, hotels, or tour operators.</p>
<h2>6. Contact Us</h2>
<p>If you have questions, please contact us through our Website.</p>
`;

const TermsAndConditions = () => {
  const { branding } = useSiteBranding();
  const siteName = branding.site_name || "Travel Vela";
  return <PolicyPage providerKey="site_terms" pageTitle="Terms and Conditions" defaultContent={defaultContent(siteName)} />;
};

export default TermsAndConditions;
