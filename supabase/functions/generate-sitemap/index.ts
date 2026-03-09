const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteUrl } = await req.json();
    const baseUrl = (siteUrl || 'https://example.com').replace(/\/+$/, '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Static pages
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/flights', priority: '0.9', changefreq: 'daily' },
      { loc: '/hotels', priority: '0.9', changefreq: 'daily' },
      { loc: '/tours', priority: '0.9', changefreq: 'daily' },
      { loc: '/blog', priority: '0.8', changefreq: 'daily' },
      { loc: '/auth', priority: '0.3', changefreq: 'monthly' },
      { loc: '/terms-and-conditions', priority: '0.3', changefreq: 'monthly' },
      { loc: '/privacy-policy', priority: '0.3', changefreq: 'monthly' },
      { loc: '/refund-policy', priority: '0.3', changefreq: 'monthly' },
    ];

    const urls: { loc: string; lastmod?: string; priority: string; changefreq: string }[] = [];

    // Add static pages
    for (const page of staticPages) {
      urls.push({ loc: `${baseUrl}${page.loc}`, priority: page.priority, changefreq: page.changefreq });
    }

    // Fetch dynamic content from Supabase
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    };

    // Blog posts
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/blog_posts?status=eq.published&select=slug,updated_at&order=updated_at.desc`, { headers });
      if (res.ok) {
        const posts = await res.json();
        for (const post of posts) {
          urls.push({
            loc: `${baseUrl}/blog/${post.slug}`,
            lastmod: post.updated_at?.split('T')[0],
            priority: '0.7',
            changefreq: 'weekly',
          });
        }
      }
    } catch (e) { console.error('Error fetching blog posts:', e); }

    // Tours
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/tours?is_active=eq.true&select=id,updated_at&order=updated_at.desc`, { headers });
      if (res.ok) {
        const tours = await res.json();
        for (const tour of tours) {
          urls.push({
            loc: `${baseUrl}/tours/${tour.id}`,
            lastmod: tour.updated_at?.split('T')[0],
            priority: '0.7',
            changefreq: 'weekly',
          });
        }
      }
    } catch (e) { console.error('Error fetching tours:', e); }

    // Hotels
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/hotels?is_active=eq.true&select=id,updated_at&order=updated_at.desc`, { headers });
      if (res.ok) {
        const hotels = await res.json();
        for (const hotel of hotels) {
          urls.push({
            loc: `${baseUrl}/hotels/${hotel.id}`,
            lastmod: hotel.updated_at?.split('T')[0],
            priority: '0.7',
            changefreq: 'weekly',
          });
        }
      }
    } catch (e) { console.error('Error fetching hotels:', e); }

    // Build XML
    const today = new Date().toISOString().split('T')[0];
    const urlEntries = urls.map((u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    return new Response(
      JSON.stringify({ success: true, sitemap, urlCount: urls.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to generate sitemap' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
