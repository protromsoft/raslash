/** Deterministic stock images for cafes / cowork spaces (no Google photos / no API key in URLs). */

const CAFE_IMAGES = [
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80',
  'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80',
  'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=800&q=80',
  'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800&q=80',
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80',
];

const COWORK_IMAGES = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80',
  'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
  'https://images.unsplash.com/photo-1600508774634-4e11d34730e2?w=800&q=80',
  'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800&q=80',
];

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function autoImageForPlace(id: string, category: string) {
  const pool = /cowork|workspace/i.test(category) ? COWORK_IMAGES : CAFE_IMAGES;
  return pool[hashId(id) % pool.length];
}

export { CAFE_IMAGES, COWORK_IMAGES };
