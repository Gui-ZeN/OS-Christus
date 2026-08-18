import { useState } from 'react';
import { DESFECHO_LABEL, cobrancaPendente, linkDaConversa, mensagemDeCobranca, tentativasDe } from '../../../api/_lib/cobranca.js';

/**
 * O BOTÃO QUE SAI DO SISTEMA.
 *
 * Fornecedor não responde e-mail; a conversa dele já acontece no WhatsApp. O
 * sistema não muda o canal — só para de exigir que alguém digite tudo de novo.
 *
 * ⚠️ A ORDEM AQUI É O CONSERTO QUE A AUDITORIA EXIGIU. Na primeira versão,
 * "Registrar cobrança" era o botão principal, e dava para gravar a cobrança ANTES
 * de cobrar: registra, abre o WhatsApp, é interrompido — e o sistema contabilizava
 * atuação que não houve, contaminando a métrica que existe para PROTEGER quem
 * cobrou. Agora `Cobrar` grava a TENTATIVA sozinho e abre a conversa; o desfecho
 * fica pendente no card. Clique não conta como cobrança concluída.
 *
 * Fornecedor sem telefone utilizável no cadastro aparece com o botão apagado —
 * cobra-se como se cobra hoje, e nada trava.
 */

type Cobranca = { em?: unknown; por?: string | null; desfecho?: string | null };

export type CompromissoCobravel = {
  id: string;
  vendorName?: string | null;
  vendorContact?: string | null;
  startAtLabel?: string | null;
  ticketIds?: string[];
  assunto?: string | null;
  local?: string | null;
  cobrancas?: Cobranca[];
};

const DESFECHOS = ['respondeu', 'nao-respondeu', 'nova-data'] as const;

export default function CobrancaDaFalta({
  compromisso,
  quemCobra,
  onTentativa,
  onDesfecho,
}: {
  compromisso: CompromissoCobravel;
  quemCobra: string;
  onTentativa: (id: string) => Promise<void>;
  onDesfecho: (id: string, desfecho: string) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);

  const tentativas = tentativasDe(compromisso);
  const pendente = cobrancaPendente(compromisso);
  const mensagem = mensagemDeCobranca({
    quemCobra,
    ordens: compromisso.ticketIds || [],
    servico: compromisso.assunto || '',
    local: compromisso.local || '',
    quando: compromisso.startAtLabel || '',
    segundaTentativa: tentativas > 0,
  });
  const link = linkDaConversa(compromisso.vendorContact, mensagem);

  const cobrar = async () => {
    setOcupado('cobrar');
    try {
      // Grava a tentativa ANTES de sair para o WhatsApp: se o registro falhar, a
      // conversa não abre e ninguém fica achando que o sistema anotou.
      await onTentativa(compromisso.id);
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    } finally {
      setOcupado(null);
    }
  };

  const desfechar = async (desfecho: string) => {
    setOcupado(desfecho);
    try {
      await onDesfecho(compromisso.id, desfecho);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="mt-2 border-t border-roman-border pt-2">
      <p className="text-xs text-roman-danger">
        {compromisso.vendorName || 'O fornecedor'} não compareceu
        {tentativas > 0 && ` · ${tentativas}ª cobrança`}
      </p>

      {pendente ? (
        // Tentativa aberta: o que falta é o desfecho, e é ele que conta como
        // cobrança concluída.
        <div className="mt-2">
          <p className="text-[11px] text-roman-text-sub">Cobrou pelo WhatsApp. O que aconteceu?</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {DESFECHOS.map(desfecho => (
              <button
                key={desfecho}
                type="button"
                disabled={Boolean(ocupado)}
                onClick={() => void desfechar(desfecho)}
                className="rounded-sm border border-roman-border px-2 py-0.5 text-[11px] text-roman-text-main transition-colors hover:border-roman-primary disabled:opacity-60"
              >
                {ocupado === desfecho ? 'Registrando…' : DESFECHO_LABEL[desfecho]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            disabled={!link || Boolean(ocupado)}
            onClick={() => void cobrar()}
            title={link ? undefined : 'Sem telefone utilizável no cadastro do fornecedor'}
            className="rounded-sm border border-roman-border px-2 py-0.5 text-[11px] font-semibold text-roman-text-main transition-colors hover:border-roman-primary disabled:opacity-50"
          >
            {ocupado === 'cobrar' ? 'Abrindo…' : tentativas > 0 ? 'Cobrar de novo' : 'Cobrar'}
          </button>
          {!link && (
            // Diz POR QUE está apagado. Botão morto sem explicação faz a pessoa
            // achar que o sistema quebrou, em vez de ir arrumar o cadastro.
            <span className="ml-2 text-[11px] text-roman-text-sub">
              sem telefone utilizável no cadastro — cobre como cobra hoje
            </span>
          )}
        </div>
      )}
    </div>
  );
}
