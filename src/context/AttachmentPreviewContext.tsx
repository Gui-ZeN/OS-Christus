import React, { createContext, useContext, useState, ReactNode } from 'react';

/**
 * Contexto isolado do preview de anexos (modal abrir/fechar). Extraído do
 * `AppContext` (god-context) — é estado puramente de UI, sem acoplamento com
 * auth/tickets. Como provider próprio, abrir/fechar um anexo só re-renderiza
 * quem consome ESTE contexto, não o app inteiro.
 */
export type AttachmentPreviewKind = 'image' | 'pdf' | 'file';

export interface AttachmentPreview {
  title: string;
  type: AttachmentPreviewKind;
  url?: string | null;
  items?: Array<{ title: string; type: AttachmentPreviewKind; url?: string | null }>;
}

interface AttachmentPreviewContextType {
  attachmentPreview: AttachmentPreview | null;
  openAttachment: (
    title: string,
    type: AttachmentPreviewKind,
    options?: { url?: string | null; items?: Array<{ title: string; type: AttachmentPreviewKind; url?: string | null }> }
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
    throw new Error('useAttachmentPreview must be used within an AttachmentPreviewProvider');
  }
  return context;
}
