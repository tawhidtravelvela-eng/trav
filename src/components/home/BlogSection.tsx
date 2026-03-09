import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useTenant } from "@/hooks/useTenant";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image: string | null;
  tags: string[];
  author_name: string;
  published_at: string | null;
  created_at: string;
  blog_categories?: { name: string } | null;
}

const BlogSection = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenant } = useTenant();

  useEffect(() => {
    let query = supabase
      .from("blog_posts")
      .select("id,title,slug,excerpt,featured_image,tags,author_name,published_at,created_at,blog_categories(name)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3);

    if (tenant) {
      query = query.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
    } else {
      query = query.is("tenant_id", null);
    }

    query.then(({ data }) => {
        if (data) setPosts(data as any);
        setLoading(false);
      });
  }, []);

  if (loading || posts.length === 0) return null;

  const formatDate = (post: Post) =>
    format(new Date(post.published_at || post.created_at), "MMM d, yyyy");

  const categoryName = (post: Post) =>
    (post.blog_categories as any)?.name || post.tags?.[0] || "Travel";

  return (
    <section className="py-16 sm:py-24 bg-background relative overflow-hidden">
      {/* Subtle background accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-primary font-semibold text-sm tracking-widest uppercase mb-3"
          >
            Latest Stories
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-2xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight"
          >
            From Our Blog
          </motion.h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-7">
          {/* Featured / large card */}
          {posts[0] && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
            >
              <Link to={`/blog/${posts[0].slug}`} className="group block h-full">
                <div className="relative bg-card border border-border/40 rounded-3xl overflow-hidden h-full flex flex-col hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500">
                  {posts[0].featured_image && (
                    <div className="aspect-[16/10] overflow-hidden">
                      <img
                        src={posts[0].featured_image}
                        alt={posts[0].title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="p-5 sm:p-7 flex flex-col flex-1">
                    <div className="flex items-center gap-2.5 mb-3">
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 rounded-full px-3 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                        {categoryName(posts[0])}
                      </Badge>
                      <span className="text-[11px] sm:text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(posts[0])}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-2xl font-bold text-foreground leading-snug mb-3 group-hover:text-primary transition-colors duration-300 line-clamp-2">
                      {posts[0].title}
                    </h3>
                    {posts[0].excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 hidden sm:block">{posts[0].excerpt}</p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/40">
                      {posts[0].author_name && (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-3 h-3 text-primary" />
                          </div>
                          {posts[0].author_name}
                        </span>
                      )}
                      <span className="text-primary font-semibold text-xs sm:text-sm flex items-center gap-1.5 group-hover:gap-3 transition-all duration-300">
                        Read More <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Right column */}
          <div className="flex flex-col gap-5 sm:gap-7">
            {posts.slice(1, 3).map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex-1"
              >
                <Link to={`/blog/${post.slug}`} className="group block h-full">
                  <div className="bg-card border border-border/40 rounded-2xl overflow-hidden flex gap-4 sm:gap-5 h-full hover:shadow-xl hover:shadow-primary/5 transition-all duration-500">
                    {post.featured_image && (
                      <div className="flex-shrink-0 w-28 sm:w-44 md:w-52 overflow-hidden">
                        <img
                          src={post.featured_image}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className="flex flex-col justify-center py-4 pr-4 sm:py-5 sm:pr-5 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-0 rounded-full px-2.5 py-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                          {categoryName(post)}
                        </Badge>
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(post)}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-lg font-bold text-foreground leading-snug mb-2 group-hover:text-primary transition-colors duration-300 line-clamp-2">
                        {post.title}
                      </h3>
                      <span className="text-primary font-semibold text-xs sm:text-sm flex items-center gap-1.5 group-hover:gap-3 transition-all duration-300">
                        Read More <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* View More */}
        <div className="mt-12 sm:mt-16 text-center">
          <Button asChild variant="outline" className="rounded-full px-8 h-11 border-border/60 hover:bg-primary hover:text-primary-foreground hover:border-primary font-semibold text-sm transition-all duration-300">
            <Link to="/blog">
              View All Articles <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default BlogSection;
