import type { ImageMetadata } from 'astro';

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/media/**/*.{jpg,jpeg,png,JPG,PNG}', {
  eager: true,
});
const showreel = import.meta.glob<{ default: ImageMetadata }>('/src/assets/showreel/*.jpg', { eager: true });
const youtube = import.meta.glob<{ default: ImageMetadata }>('/src/assets/youtube/*.jpg', { eager: true });

/** Restituisce i metadati di un'immagine in src/assets/media (es. "2026/04/piegatura-1.png"). */
export function media(path: string): ImageMetadata {
  const mod = images[`/src/assets/media/${path}`];
  if (!mod) throw new Error(`[media] Immagine non trovata: ${path}`);
  return mod.default;
}

export function still(name: string): ImageMetadata {
  const mod = showreel[`/src/assets/showreel/${name}.jpg`];
  if (!mod) throw new Error(`[media] Fotogramma showreel non trovato: ${name}`);
  return mod.default;
}

export function ytThumb(id: string): ImageMetadata | undefined {
  return youtube[`/src/assets/youtube/${id}.jpg`]?.default;
}

export type GalleryItem = string | { src: string; alt: string };

export const galleryEntry = (item: GalleryItem, fallbackAlt: string) =>
  typeof item === 'string' ? { src: media(item), alt: fallbackAlt } : { src: media(item.src), alt: item.alt };
