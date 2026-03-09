import PolicyPage from "@/components/PolicyPage";
import { useSiteBranding } from "@/hooks/useSiteBranding";

const defaultContent = (name: string) => `
<h2>1. Flight Refunds</h2>
<ul><li>Refund eligibility depends on the fare type and airline policy.</li><li>Non-refundable tickets may only receive a partial refund of taxes and fees.</li><li>Refund requests must be submitted within 24 hours of booking for a full refund (where applicable).</li></ul>
<h2>2. Hotel Refunds</h2>
<ul><li>Refund policies vary by hotel and room type.</li><li>Free cancellation is available for eligible bookings if cancelled before the deadline.</li><li>No-show bookings are generally non-refundable.</li></ul>
<h2>3. Tour Refunds</h2>
<ul><li>Tour cancellations made 14+ days before departure may receive a full refund.</li><li>Cancellations within 7-14 days may incur a 50% cancellation fee.</li><li>Cancellations within 7 days of departure are non-refundable.</li></ul>
<h2>4. Processing Time</h2>
<p>Approved refunds are typically processed within 7-14 business days. The time for the refund to appear in your account depends on your payment provider.</p>
<h2>5. Service Fees</h2>
<p>${name} service/convenience fees are non-refundable unless the cancellation is due to an error on our part.</p>
<h2>6. How to Request a Refund</h2>
<p>To request a refund, please contact our support team with your booking ID and reason for cancellation.</p>
`;

const RefundPolicy = () => {
  const { branding } = useSiteBranding();
  const siteName = branding.site_name || "Travel Vela";
  return <PolicyPage providerKey="site_refund" pageTitle="Refund Policy" defaultContent={defaultContent(siteName)} />;
};

export default RefundPolicy;
