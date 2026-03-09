import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { useParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Calendar, User } from "lucide-react";
import { format } from "date-fns";

interface BlogPostData {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  tags: string[];
  author_name: string;
  published_at: string | null;
  created_at: string;
  category_id: string | null;
}

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (data) {
        setPost(data as any);
        if (data.category_id) {
          const { data: cat } = await supabase.from("blog_categories").select("name").eq("id", data.category_id).maybeSingle();
          if (cat) setCategoryName(cat.name);
        }
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Post not found</h1>
          <Button asChild variant="outline"><Link to="/blog"><ArrowLeft className="w-4 h-4 mr-2" />Back to Blog</Link></Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="min-h-screen bg-background">
        {post.featured_image && (
          <div className="w-full max-h-[480px] overflow-hidden">
            <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <Button asChild variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground">
            <Link to="/blog"><ArrowLeft className="w-4 h-4" />Back to Blog</Link>
          </Button>

          <div className="flex items-center gap-2 flex-wrap mb-4">
            {categoryName && <Badge>{categoryName}</Badge>}
            {post.tags.map((t) => (
              <Badge key={t} variant="outline">{t}</Badge>
            ))}
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight mb-4">{post.title}</h1>

          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-6 border-b border-border">
            {post.author_name && (
              <span className="flex items-center gap-1.5"><User className="w-4 h-4" />{post.author_name}</span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {format(new Date(post.published_at || post.created_at), "MMMM d, yyyy")}
            </span>
          </div>

          <div
            className="prose prose-lg max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'] }) }}
          />
        </div>
      </article>
    </Layout>
  );
};

export default BlogPost;
