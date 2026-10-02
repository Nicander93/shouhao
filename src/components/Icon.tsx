import { FileText, Film, Globe2, Headphones, Image, NotebookPen } from 'lucide-react';
import type { ContentType } from '../../shared/types';
export function ContentIcon({ type, size = 16 }: { type: ContentType; size?: number }) {
  const icons = {
    webpage: Globe2,
    article: FileText,
    video: Film,
    audio: Headphones,
    note: NotebookPen,
    image: Image,
  };
  const Icon = icons[type];
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}
