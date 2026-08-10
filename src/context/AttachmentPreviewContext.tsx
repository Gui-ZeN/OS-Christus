import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserFacingError } from '../utils/errorMessage';
/**
 * Contexto isolado do preview de anexos (modal abrir/fechar). Extraído do
 * `AppContext` (god-context) — é estado puramente de UI, sem acoplamento com
 * auth/tickets. Como provider próprio, abrir/fechar um anexo só re-renderiza
 * quem consome ESTE contexto, não o app inteiro.
 */
export type AttachmentPreviewKind = 'image' | 'pdf' | 'file';

/**
 * Que tipo de preview este anexo abre.
 *
 * Existia duas vezes, com regras diferentes: na lista do histórico um .gif abria como
 * imagem, no painel da OS o MESMO arquivo caía em "arquivo genérico". Aqui é a união
 * das duas, ao lado do tipo que ela devolve.
 */
export function resolveAttachmentPreviewType(
  contentType?: string | null,
  fileName?: string | null
): AttachmentPreviewKind {
  const mime = String(contentType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
  return 'file';
}

export interface AttachmentPreviewItem {
  title: string;
  type: AttachmentPreviewKind;
  url?: string | null;
  ticketId?: string | null;
  path?: string | null;
  driveFileId?: string | null;
}

export interface AttachmentPreview extends AttachmentPreviewItem {
  items?: AttachmentPreviewItem[];
}

interface AttachmentPreviewContextType {
  attachmentPreview: AttachmentPreview | null;
  openAttachment: (
    title: string,
    type: AttachmentPreviewKind,
    options?: Omit<AttachmentPreview, 'title' | 'type'>
  ) => void;
  closeAttachment: () => void;
}

const AttachmentPreviewContext = createContext<AttachmentPreviewContextType | undefined>(undefined);

export function AttachmentPreviewProvider({ children }: { children: ReactNode }) {
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);

  const openAttachment: AttachmentPreviewContextType['openAttachment'] = (title, type, options) => {
    setAttachmentPreview({
      title,
      type,
      url: options?.url || null,
      ticketId: options?.ticketId || null,
      path: options?.path || null,
      driveFileId: options?.driveFileId || null,
      items: options?.items || [],
    });
  };

  const closeAttachment = () => setAttachmentPreview(null);

  return (
    <AttachmentPreviewContext.Provider value={{ attachmentPreview, openAttachment, closeAttachment }}>
      {children}
    </AttachmentPreviewContext.Provider>
  );
}

export function useAttachmentPreview() {
  const context = useContext(AttachmentPreviewContext);
  if (!context) {
    throw new UserFacingError('useAttachmentPreview must be used within an AttachmentPreviewProvider');
  }
  return context;
}
