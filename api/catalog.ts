import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../src/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const [categories, products] = await Promise.all([
    db.from('categories').select('id,name,emoji,description').eq('is_active', true).order('sort_order'),
    db.from('products')
      .select('id,category_id,name,brand,model,price,currency,description,specifications,stock_quantity,image_url,is_new')
      .eq('status', 'active')
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (categories.error || products.error) {
    console.error('Mini App catalogue query failed', { categories: categories.error, products: products.error });
    res.status(503).json({ error: 'Catalogue temporarily unavailable' });
    return;
  }

  res.status(200).json({ categories: categories.data ?? [], products: products.data ?? [] });
}
