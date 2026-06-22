import React from 'react';
import { Plus } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import type { DirectoryVendor } from '../../services/directoryApi';

interface ThirdPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSending: boolean;
  canEdit: boolean;
  // Filtro / seleção
  thirdPartyTag: string;
  thirdPartyTagOptions: string[];
  onSelectTag: (tag: string) => void;
  thirdPartySelectDraftId: string;
  onSelectDraft: (id: string) => void;
  filteredThirdParties: DirectoryVendor[];
  selectedThirdParties: DirectoryVendor[];
  onRemoveSelected: (id: string) => void;
  customEmail: string;
  onCustomEmailChange: (value: string) => void;
  // Cadastro de novo terceiro
  newThirdPartyName: string;
  onNewNameChange: (value: string) => void;
  newThirdPartyEmail: string;
  onNewEmailChange: (value: string) => void;
  newThirdPartyContact: string;
  onNewContactChange: (value: string) => void;
  newThirdPartyTags: string[];
  onToggleNewTag: (tag: string) => void;
  newSharedTagDraft: string;
  onNewSharedTagDraftChange: (value: string) => void;
  newSharedTagSaving: boolean;
  onCreateSharedTag: () => void;
  onCreateThirdParty: () => void;
}

/** Modal de seleção/cadastro de terceiros (extraído do InboxView). */
export function ThirdPartyModal(props: ThirdPartyModalProps) {
  const {
    isOpen, onClose, isSending, canEdit,
    thirdPartyTag, thirdPartyTagOptions, onSelectTag,
    thirdPartySelectDraftId, onSelectDraft,
    filteredThirdParties, selectedThirdParties, onRemoveSelected,
    customEmail, onCustomEmailChange,
    newThirdPartyName, onNewNameChange,
    newThirdPartyEmail, onNewEmailChange,
    newThirdPartyContact, onNewContactChange,
    newThirdPartyTags, onToggleNewTag,
    newSharedTagDraft, onNewSharedTagDraftChange, newSharedTagSaving,
    onCreateSharedTag, onCreateThirdParty,
  } = props;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Selecionar terceiros"
      description="Selecione os terceiros responsáveis, filtre por tag e cadastre novos parceiros sem sair da triagem."
      maxWidthClass="max-w-3xl"
      footer={(
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm"
          >
            Fechar
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Filtro por tag</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectTag('')}
              className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                !thirdPartyTag
                  ? 'border-roman-primary bg-roman-primary text-white'
                  : 'border-roman-border bg-roman-surface text-roman-text-main hover:border-roman-primary'
              }`}
              disabled={isSending || !canEdit}
            >
              Todas
            </button>
            {thirdPartyTagOptions.map(tag => (
              <button
                key={`tag-modal-${tag}`}
                type="button"
                onClick={() => onSelectTag(tag)}
                className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                  thirdPartyTag === tag
                    ? 'border-roman-primary bg-roman-primary text-white'
                    : 'border-roman-border bg-roman-surface text-roman-text-main hover:border-roman-primary'
                }`}
                disabled={isSending || !canEdit}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Lista de terceiros</label>
          <select
            value={thirdPartySelectDraftId}
            onChange={event => onSelectDraft(event.target.value)}
            className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSending || !canEdit}
          >
            <option value="">Selecione o terceiro...</option>
            {filteredThirdParties.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        {selectedThirdParties.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedThirdParties.map(vendor => (
              <span key={`selected-vendor-modal-${vendor.id}`} className="inline-flex items-center gap-1 rounded-sm border border-roman-primary/40 bg-roman-primary/10 px-2 py-0.5 text-[11px] text-roman-primary">
                {vendor.name}{vendor.contact ? ` · ${vendor.contact}` : ''}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onRemoveSelected(vendor.id)}
                    className="text-roman-primary hover:opacity-70"
                    aria-label={`Remover ${vendor.name}`}
                    title={`Remover ${vendor.name}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div>
          <label className="mb-1 block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">E-mail manual adicional (opcional)</label>
          <input
            type="email"
            value={customEmail}
            onChange={e => onCustomEmailChange(e.target.value)}
            placeholder="terceiro@email.com"
            className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSending || !canEdit}
          />
        </div>

        {canEdit && (
          <div className="space-y-2 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-3">
            <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Cadastrar novo terceiro</div>
            <input
              type="text"
              value={newThirdPartyName}
              onChange={event => onNewNameChange(event.target.value)}
              placeholder="Nome do terceiro"
              className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
            />
            <input
              type="email"
              value={newThirdPartyEmail}
              onChange={event => onNewEmailChange(event.target.value)}
              placeholder="Email (opcional)"
              className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
            />
            <input
              type="text"
              value={newThirdPartyContact}
              onChange={event => onNewContactChange(event.target.value)}
              placeholder="Contato (opcional)"
              className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
            />
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Tags compartilhadas</label>
                <button
                  type="button"
                  onClick={() => void onCreateSharedTag()}
                  disabled={newSharedTagSaving || !newSharedTagDraft.trim()}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-roman-border bg-white text-roman-text-main transition-colors hover:border-roman-primary disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Cadastrar tag compartilhada"
                  title="Cadastrar tag compartilhada"
                >
                  <Plus size={12} />
                </button>
              </div>
              <input
                type="text"
                value={newSharedTagDraft}
                onChange={event => onNewSharedTagDraftChange(event.target.value)}
                placeholder="Nova tag (ex.: Gesso)"
                className="mb-2 w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
              />
              {thirdPartyTagOptions.length === 0 ? (
                <div className="w-full rounded-sm border border-roman-border bg-white px-3 py-2 text-[13px] text-roman-text-sub">
                  Cadastre tags em Configurações para selecionar aqui.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {thirdPartyTagOptions.map(tag => {
                    const selected = newThirdPartyTags.some(item => item.toLowerCase() === tag.toLowerCase());
                    return (
                      <button
                        key={`new-third-party-tag-modal-${tag}`}
                        type="button"
                        onClick={() => onToggleNewTag(tag)}
                        className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                          selected
                            ? 'border-roman-primary bg-roman-primary text-white'
                            : 'border-roman-border bg-white text-roman-text-main hover:border-roman-primary'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void onCreateThirdParty()}
              className="w-full rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
            >
              Cadastrar terceiro
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
