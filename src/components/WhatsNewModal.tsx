import { CURRENT_RELEASE } from '../constants/releaseNotes';
import { ModalShell } from './ui/ModalShell';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsNewModal({ isOpen, onClose }: WhatsNewModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={CURRENT_RELEASE.title}
      description={CURRENT_RELEASE.subtitle}
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-roman-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-roman-primary-hover"
          >
            Entendi
          </button>
        </div>
      }
    >
      <ul className="space-y-4">
        {CURRENT_RELEASE.items.map(item => (
          <li key={item.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-roman-primary/10 text-roman-primary">
              <item.Icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-roman-text-main">{item.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-roman-text-sub">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </ModalShell>
  );
}
