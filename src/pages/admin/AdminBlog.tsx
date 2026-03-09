import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, Loader2, Upload, X, Tag } from "lucide-react";
import { format } from "date-fns";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  category_id: string | null;
  tags: string[];
  status: string;
  author_name: string;
  published_at: string | null;
  created_at: string;
}

interface BlogCategory {
  id: string;
  name: string;
  slug: string;
}

const emptyPost = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  featured_image: "",
  category_id: "",
  tags: [] as string[],
  status: "draft",
  author_name: "",
};

const AdminBlog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPost);
  const [tagInput, setTagInput] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [uploading, setUploading] = useState(false);
  const { adminTenantId } = useAdminTenantFilter();

  const fetchData = async () => {
    setLoading(true);
    let postsQuery = supabase.from("blog_posts").select("*").order("created_at", { ascending: false });
    if (adminTenantId) {
      postsQuery = postsQuery.eq("tenant_id", adminTenantId);
    }
    const [postsRes, catsRes] = await Promise.all([
      postsQuery,
      supabase.from("blog_categories").select("*").order("name"),
    ]);
    if (postsRes.data) setPosts(postsRes.data as any);
    if (catsRes.data) setCategories(catsRes.data as any);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const slugify = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const openCreate = () => {
    setEditingPost(null);
    setForm(emptyPost);
    setTagInput("");
    setDialogOpen(true);
  };

  const openEdit = (post: BlogPost) => {
    setEditingPost(post.id);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      content: post.content,
      featured_image: post.featured_image || "",
      category_id: post.category_id || "",
      tags: post.tags || [],
      status: post.status,
      author_name: post.author_name,
    });
    setTagInput("");
    setDialogOpen(true);
  };

  const handleTitleChange = (title: string) => {
    setForm((f) => ({ ...f, title, slug: editingPost ? f.slug : slugify(title) }));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("blog-images").upload(path, file);
    if (error) {
      toast.error("Upload failed: " + error.message);
    } else {
      const { data } = supabase.storage.from("blog-images").getPublicUrl(path);
      setForm((f) => ({ ...f, featured_image: data.publicUrl }));
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.title || !form.slug) {
      toast.error("Title and slug are required");
      return;
    }
    setSaving(true);
    const payload: any = {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt || null,
      content: form.content,
      featured_image: form.featured_image || null,
      category_id: form.category_id || null,
      tags: form.tags,
      status: form.status,
      author_name: form.author_name,
      published_at: form.status === "published" ? new Date().toISOString() : null,
    };

    let error;
    if (editingPost) {
      ({ error } = await supabase.from("blog_posts").update(payload).eq("id", editingPost));
    } else {
      if (adminTenantId) payload.tenant_id = adminTenantId;
      ({ error } = await supabase.from("blog_posts").insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editingPost ? "Post updated" : "Post created");
      setDialogOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post deleted"); fetchData(); }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const { error } = await supabase.from("blog_categories").insert({
      name: newCatName.trim(),
      slug: slugify(newCatName),
    });
    if (error) toast.error(error.message);
    else { toast.success("Category added"); setNewCatName(""); fetchData(); }
  };

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from("blog_categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Category deleted"); fetchData(); }
  };

  const getCategoryName = (id: string | null) => categories.find((c) => c.id === id)?.name || "—";

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Blog</h1>
            <p className="text-muted-foreground mt-1">Manage blog posts and categories</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><Tag className="w-4 h-4" />Categories</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Manage Categories</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" onKeyDown={(e) => e.key === "Enter" && handleAddCategory()} />
                    <Button onClick={handleAddCategory}>Add</Button>
                  </div>
                  <div className="space-y-2">
                    {categories.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                        <span className="text-sm">{cat.name}</span>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(cat.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    ))}
                    {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet</p>}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" />New Post</Button>
          </div>
        </div>

        {/* Posts table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{post.title}</p>
                        {post.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {post.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getCategoryName(post.category_id)}</TableCell>
                    <TableCell>
                      <Badge variant={post.status === "published" ? "default" : "secondary"}>
                        {post.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(post.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {post.status === "published" && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`/blog/${post.slug}`} target="_blank"><Eye className="w-4 h-4" /></a>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(post)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(post.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {posts.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No blog posts yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPost ? "Edit Post" : "New Post"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Post title" className="mt-1" />
                </div>
                <div>
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="post-url-slug" className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Author Name</Label>
                  <Input value={form.author_name} onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))} placeholder="Author" className="mt-1" />
                </div>
              </div>

              <div>
                <Label>Excerpt</Label>
                <Textarea value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} placeholder="Short summary..." className="mt-1" rows={2} />
              </div>

              <div>
                <Label>Featured Image</Label>
                <div className="mt-1 flex items-center gap-3">
                  {form.featured_image && (
                    <img src={form.featured_image} alt="" className="h-20 w-32 object-cover rounded-md border border-border" />
                  )}
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Upload className="w-4 h-4" />
                      {uploading ? "Uploading..." : "Upload Image"}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                  </label>
                  {form.featured_image && (
                    <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, featured_image: "" }))}><X className="w-4 h-4" /></Button>
                  )}
                </div>
              </div>

              <div>
                <Label>Tags</Label>
                <div className="mt-1 flex gap-2 flex-wrap items-center">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}
                      <button onClick={() => removeTag(t)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="Add tag & press Enter"
                    className="w-48 h-8 text-sm"
                  />
                </div>
              </div>

              <div>
                <Label>Content</Label>
                <div className="mt-1">
                  <RichTextEditor content={form.content} onChange={(html) => setForm((f) => ({ ...f, content: html }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPost ? "Update Post" : "Create Post"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminBlog;
