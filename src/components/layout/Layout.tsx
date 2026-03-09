import Header from "./Header";
import Footer from "./Footer";
import BackToTop from "./BackToTop";
import CrispChat from "./CrispChat";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen flex flex-col scroll-smooth">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <BackToTop />
      <CrispChat />
    </div>
  );
};

export default Layout;
