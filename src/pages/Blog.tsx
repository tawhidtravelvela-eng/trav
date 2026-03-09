import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Calendar, User, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useTenant } from "@/hooks/useTenant";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  tags: string[];
  author_name: string;
  published_at: string | null;
  created_at: string;
  category_id: string | null;
}

interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { tenant } = useTenant();

  useEffect(() => {
    const load = async () => {
      let postsQuery = supabase.from("blog_posts").select("id,title,slug,excerpt,featured_image,tags,author_name,published_at,created_at,category_id").eq("status", "published").order("published_at", { ascending: false });

      if (tenant) {
        postsQuery = postsQuery.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
      } else {
        postsQuery = postsQuery.is("tenant_id", null);
      }

      const [postsRes, catsRes] = await Promise.all([
        postsQuery,
        supabase.from("blog_categories").select("*").order("name"),
      ]);
      if (postsRes.data) setPosts(postsRes.data as any);
      if (catsRes.data) setCategories(catsRes.data as any);
      setLoading(false);
    };
    load();
  }, [tenant]);

  const filtered = posts.filter((p) => {
    const matchesSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || (p.excerpt || "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = !selectedCategory || p.category_id === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const getCategoryName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-background border-b border-border">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_60%)]" />
          <div className="container mx-auto px-4 py-20 sm:py-28 text-center relative z-10">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-primary font-semibold text-sm tracking-widest uppercase mb-3"
            >
              Our Blog
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4 tracking-tight"
            >
              Travel Stories & Guides
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground text-lg max-w-2xl mx-auto"
            >
              Discover travel tips, destination guides, and insider insights to inspire your next adventure
            </motion.p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:py-14">
          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 mb-10 sm:mb-14"
          >
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles..."
                className="pl-10 h-11 rounded-full border-border/60 bg-muted/30 focus:bg-background transition-colors"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide uppercase transition-all duration-200 ${
                  !selectedCategory
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide uppercase transition-all duration-200 ${
                    selectedCategory === c.id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">No articles found</div>
          ) : (
            <div className="space-y-14">
              {/* Featured post */}
              {featured && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <Link to={`/blog/${featured.slug}`} className="group block">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 bg-muted/20 border border-border/40 rounded-3xl overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all duration-500">
                      {featured.featured_image && (
                        <div className="aspect-[16/10] lg:aspect-auto overflow-hidden">
                          <img
                            src={featured.featured_image}
                            alt={featured.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          />
                        </div>
                      )}
                      <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                        <div className="flex items-center gap-3 mb-4">
                          {getCategoryName(featured.category_id) && (
                            <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                              {getCategoryName(featured.category_id)}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground font-medium">
                            {format(new Date(featured.published_at || featured.created_at), "MMMM d, yyyy")}
                          </span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground leading-tight mb-4 group-hover:text-primary transition-colors duration-300">
                          {featured.title}
                        </h2>
                        {featured.excerpt && (
                          <p className="text-muted-foreground leading-relaxed mb-6 line-clamp-3">{featured.excerpt}</p>
                        )}
                        <div className="flex items-center justify-between">
                          {featured.author_name && (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-4 h-4 text-primary" />
                              </div>
                              {featured.author_name}
                            </span>
                          )}
                          <span className="text-primary font-semibold text-sm flex items-center gap-1.5 group-hover:gap-3 transition-all duration-300">
                            Read Article <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )}

              {/* Grid of remaining posts */}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {rest.map((post, i) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                    >
                      <Link to={`/blog/${post.slug}`} className="group block h-full">
                        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden h-full flex flex-col hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-500">
                          {post.featured_image ? (
                            <div className="aspect-[16/10] overflow-hidden">
                              <img
                                src={post.featured_image}
                                alt={post.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                              />
                            </div>
                          ) : (
                            <div className="aspect-[16/10] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                              <span className="text-4xl opacity-30">✍️</span>
                            </div>
                          )}
                          <div className="p-5 sm:p-6 flex flex-col flex-1">
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              {getCategoryName(post.category_id) && (
                                <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                                  {getCategoryName(post.category_id)}
                                </Badge>
                              )}
                              {post.tags.slice(0, 1).map((t) => (
                                <Badge key={t} variant="outline" className="rounded-full text-[10px] px-2.5 py-0.5 border-border/60 text-muted-foreground">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                            <h2 className="text-lg font-bold text-foreground leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors duration-300">
                              {post.title}
                            </h2>
                            {post.excerpt && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">{post.excerpt}</p>
                            )}
                            <div className="flex items-center justify-between pt-4 border-t border-border/40 mt-auto">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {post.author_name && (
                                  <span className="flex items-center gap-1.5">
                                    <User className="w-3 h-3" />{post.author_name}
                                  </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(post.published_at || post.created_at), "MMM d, yyyy")}
                                </span>
                              </div>
                              <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300" />
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Blog;
