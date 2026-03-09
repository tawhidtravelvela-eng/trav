import Layout from "@/components/layout/Layout";
import HeroSection from "@/components/home/HeroSection";
import StatsBar from "@/components/home/StatsBar";
import TrendingFlights from "@/components/home/TrendingFlights";
import DestinationsSection from "@/components/home/DestinationsSection";
import OffersSection from "@/components/home/OffersSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import NewsletterSection from "@/components/home/NewsletterSection";
import WhyChooseUs from "@/components/home/WhyChooseUs";
import AppDownload from "@/components/home/AppDownload";
import BannersSection from "@/components/home/BannersSection";
import BlogSection from "@/components/home/BlogSection";
import { useSiteContent } from "@/hooks/useSiteContent";

const sectionComponents: Record<string, React.ComponentType> = {
  hero: HeroSection,
  stats: StatsBar,
  banners: BannersSection,
  offers: OffersSection,
  trending: TrendingFlights,
  destinations: DestinationsSection,
  features: WhyChooseUs,
  testimonials: TestimonialsSection,
  app_download: AppDownload,
  blog: BlogSection,
  newsletter: NewsletterSection,
};

const defaultSections = [
  "hero", "stats", "offers", "trending", "destinations",
  "features", "testimonials", "app_download", "blog", "newsletter",
];

const Index = () => {
  const { content } = useSiteContent();
  const homepage = content.homepage;

  // Sections order and visibility from API, with fallback to defaults
  const sections: string[] = homepage.sections?.length ? homepage.sections : defaultSections;
  const hiddenSections: string[] = homepage.hidden_sections || [];

  return (
    <Layout>
      {sections
        .filter((id) => !hiddenSections.includes(id))
        .map((id) => {
          const Component = sectionComponents[id];
          return Component ? <Component key={id} /> : null;
        })}
    </Layout>
  );
};

export default Index;
