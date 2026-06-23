import { memo } from 'react';
import { Clock, FileText } from 'lucide-react';
import type { HistoryItem } from '../../types';
import { cleanForwardedMessageText } from '../../utils/text';
import { formatDateTimeSafe } from '../../utils/date';
import { DateTimePicker, formatInputDateTime } from './DateTimePicker';
import { MessageBody } from './MessageBody';

type PreviewKind = 'image' | 'pdf' | 'file';

// Pura (espelha a da InboxView): tipo de pré-visualização do anexo.
function resolveAttachmentPreviewType(contentType?: string | null, fileName?: string | null): PreviewKind {
  const type = String(contentType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return 'file';
}

interface TicketHistoryProps {
  history: HistoryItem[];
  canManageStatus: boolean;
  isSending: boolean;
  onUpdateItemTime: (originalIndex: number, value: string) => void;
  onOpenAttachment: (
    title: string,
    type: PreviewKind,
    options?: { url?: string | null; items?: Array<{ title: string; type: PreviewKind; url?: string | null }> }
  ) => void;
}

/**
 * Lista de mensagens do histórico da OS. Extraída do InboxView e memoizada: com
 * `history` e os callbacks estáveis, não re-renderiza a cada tecla no composer
 * (era a maior parte do custo da "travada" ao digitar).
 */
function TicketHistoryComponent({ history, canManageStatus, isSending, onUpdateItemTime, onOpenAttachment }: TicketHistoryProps) {
  return (
    <div className="space-y-4 pb-3">
      {history
        .map((item, originalIndex) => ({ item, originalIndex }))
        .sort((a, b) => a.item.time.getTime() - b.item.time.getTime())
        .map(({ item, originalIndex }) => {
          if (item.type === 'system') {
            const displayText = cleanForwardedMessageText(item.text);
            return (
              <div key={`${item.id || 'system'}-${originalIndex}`} className="flex justify-center">
                <div className="max-w-[92%] rounded-full border border-roman-border bg-roman-border-light/50 px-3 py-1 text-roman-text-sub xl:max-w-[86%]">
                  <div className="flex items-center justify-center gap-2 text-center">
                    <div className="flex min-w-0 items-center gap-1.5 font-serif italic text-[10px] md:text-[11px]">
                      <Clock size={11} />
                      <span className="truncate">{displayText}</span>
                    </div>
                    <div className="shrink-0 text-[10px] font-sans text-roman-text-sub/80">
                      {formatDateTimeSafe(item.time)}
                    </div>
                    {canManageStatus && (
                      <div className="shrink-0">
                        <DateTimePicker
                          value={formatInputDateTime(item.time)}
                          onChange={value => onUpdateItemTime(originalIndex, value)}
                          compact
                          iconOnly
                          disabled={isSending}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === 'field_change') {
            return (
              <div key={`${item.id || 'field'}-${originalIndex}`} className="flex justify-center">
                <div className="bg-roman-bg border border-roman-border rounded-sm px-3 py-1.5 text-[10px] text-roman-text-sub font-mono flex flex-wrap items-center justify-center gap-1.5">
                  <span className="font-semibold">{item.sender}</span> alterou
                  <span className="font-medium bg-roman-surface px-1 rounded border border-roman-border">{item.field}</span>
                  de <span className="line-through opacity-70">{item.from}</span>
                  para <span className="font-medium text-roman-text-main">{item.to}</span>
                  <span className="text-[10px] opacity-50">{formatDateTimeSafe(item.time)}</span>
                  {canManageStatus && (
                    <div className="shrink-0">
                      <DateTimePicker
                        value={formatInputDateTime(item.time)}
                        onChange={value => onUpdateItemTime(originalIndex, value)}
                        compact
                        iconOnly
                        disabled={isSending}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const isExternalMessage = item.type === 'customer';
          const isInternalNote = item.visibility === 'internal' || item.type === 'internal';
          const senderInitial = item.sender?.trim().charAt(0).toUpperCase() || 'U';
          const messageAttachmentItems = (Array.isArray(item.attachments) ? item.attachments : [])
            .filter(attachment => attachment?.url)
            .map(attachment => ({
              title: attachment.name,
              type: resolveAttachmentPreviewType(attachment.contentType, attachment.name),
              url: attachment.url,
            }));

          return (
            <div key={`${item.id || 'message'}-${originalIndex}`} className={`flex gap-3 ${isExternalMessage ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex w-full max-w-[94%] gap-3 xl:max-w-[88%] ${isExternalMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-9 h-9 rounded-sm border flex items-center justify-center font-serif text-base shrink-0 ${
                  isExternalMessage
                    ? 'bg-roman-primary/10 text-roman-primary border-roman-primary/20'
                    : isInternalNote
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-roman-border-light text-roman-text-main border-roman-border'
                }`}>
                  {senderInitial}
                </div>
                <div className={`flex-1 ${isExternalMessage ? 'text-right' : 'text-left'}`}>
                  <div className={`flex items-baseline gap-2 mb-1 ${isExternalMessage ? 'justify-end' : 'justify-start'}`}>
                    <span className="font-semibold text-[12px]">{item.sender}</span>
                    <span className="text-roman-text-sub text-[11px] font-serif italic">
                      {formatDateTimeSafe(item.time)}
                    </span>
                  </div>
                  {canManageStatus && (
                    <div className={`mb-2 ${isExternalMessage ? 'text-right' : 'text-left'}`}>
                      <div className="inline-block">
                        <DateTimePicker
                          value={formatInputDateTime(item.time)}
                          onChange={value => onUpdateItemTime(originalIndex, value)}
                          compact
                          iconOnly
                          disabled={isSending}
                        />
                      </div>
                    </div>
                  )}
                  <div
                    className={`rounded-sm p-3 text-[12px] leading-relaxed shadow-sm border ${
                      isExternalMessage
                        ? 'bg-roman-primary/5 border-roman-primary/20'
                        : isInternalNote
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-roman-surface border-roman-border'
                    }`}
                  >
                    <MessageBody text={item.text} />
                    {messageAttachmentItems.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {messageAttachmentItems.map((attachment, attachmentIndex) => (
                          <button
                            key={`${item.id}-attachment-${attachmentIndex}`}
                            type="button"
                            onClick={() => onOpenAttachment(attachment.title, attachment.type, { url: attachment.url, items: messageAttachmentItems })}
                            className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-white/70 px-2 py-1 text-[11px] text-roman-text-main transition-colors hover:border-roman-primary"
                          >
                            <FileText size={12} />
                            <span className="max-w-[180px] truncate">{attachment.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

export const TicketHistory = memo(TicketHistoryComponent);
