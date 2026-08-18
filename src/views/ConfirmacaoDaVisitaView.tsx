import { useCallback, useEffect, useState } from 'react';

/**
 * A PÁGINA QUE O COORDENADOR DA SEDE ABRE — sem login, sem menu, sem sistema.
 *
 * Ela é a segunda metade de uma trava de segurança: o botão do e-mail NÃO grava,
 * porque filtro de segurança de e-mail corporativo abre links sozinho para checar
 * se são seguros — e um link que grava registraria faltas que ninguém informou.
 * O e-mail traz até aqui; o registro acontece no toque desta página.
 *
 * Por isso ela carrega em GET (que não escreve) e só grava no POST do botão.
 */

type Ordem = { id: string; assunto: string };

type Pergunta = {
  sede: string | null;
  fornecedor: string | null;
  marcadoPara: string | null;
  ordens: Ordem[];
  convidado: { nome: string | null; email: string | null };
  estado: string;
  jaRespondido: boolean;
  respondidoPor: string | null;
  respondidoEm: string | null;
  podeDesfazer: boolean;
};

const ESCOLHAS = [
  { id: 'chegou', rotulo: 'Sim, chegou', ajuda: 'a equipe está aqui ou já veio', tom: 'ok' },
  { id: 'nao-apareceu', rotulo: 'Não apareceu', ajuda: 'a manutenção é avisada na hora', tom: 'ruim' },
  { id: 'resolvido-pela-sede', rotulo: 'Já foi resolvido pela sede', ajuda: 'não precisa mais da visita', tom: 'neutro' },
] as const;

function horaLegivel(iso: string | null) {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConfirmacaoDaVisitaView({ token }: { token: string }) {
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/tickets?route=confirm-visit&token=${encodeURIComponent(token)}`);
        const dados = await resposta.json();
        if (!ativo) return;
        if (!resposta.ok) setErro(dados?.error || 'Não foi possível abrir esta confirmação.');
        else setPergunta(dados.pergunta);
      } catch {
        if (ativo) setErro('Não foi possível abrir esta confirmação. Verifique a conexão.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [token]);

  const registrar = useCallback(
    async (escolha: string) => {
      setEnviando(escolha);
      setErro(null);
      try {
        const resposta = await fetch('/api/tickets?route=confirm-visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, escolha }),
        });
        const dados = await resposta.json();
        if (dados?.pergunta) setPergunta(dados.pergunta);
        // Só declara sucesso com o servidor confirmando: a tela nunca diz
        // "registrado" por conta própria.
        if (resposta.ok) setRegistrado(true);
        else setErro(dados?.error || 'Não foi possível registrar.');
      } catch {
        setErro('Não foi possível registrar. Verifique a conexão e tente de novo.');
      } finally {
        setEnviando(null);
      }
    },
    [token]
  );

  return (
    <div className="min-h-screen bg-roman-bg px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-roman-text-sub">Serv3</div>

        {carregando && <p className="text-roman-text-sub">Abrindo a confirmação…</p>}

        {!carregando && erro && !pergunta && (
          <div className="rounded-lg border border-roman-border bg-roman-surface p-5">
            <h1 className="text-lg font-semibold text-roman-text">Não deu para abrir</h1>
            <p className="mt-2 text-sm text-roman-text-sub">{erro}</p>
          </div>
        )}

        {pergunta && (
          <div className="rounded-lg border border-roman-border bg-roman-surface p-5">
            {registrado || pergunta.jaRespondido ? (
              <Registrado pergunta={pergunta} aoDesfazer={() => registrar('apareceu-depois')} enviando={enviando} />
            ) : (
              <>
                <h1 className="text-xl font-semibold text-roman-text">
                  {pergunta.fornecedor ? `${pergunta.fornecedor} chegou` : 'A visita aconteceu'}
                  {pergunta.sede ? ` na ${pergunta.sede}` : ''}?
                </h1>
                <p className="mt-1 text-sm text-roman-text-sub">
                  Marcado para {horaLegivel(pergunta.marcadoPara) || 'hoje'}
                  {pergunta.ordens.length > 0 && ` · ${pergunta.ordens.map(o => o.id).join(', ')}`}
                </p>
                {pergunta.ordens.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {pergunta.ordens.map(ordem => (
                      <li key={ordem.id} className="text-sm text-roman-text">
                        {ordem.assunto}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-6 space-y-2">
                  {ESCOLHAS.map(escolha => (
                    <button
                      key={escolha.id}
                      type="button"
                      disabled={Boolean(enviando)}
                      onClick={() => registrar(escolha.id)}
                      className="flex w-full flex-col items-start rounded-lg border border-roman-border bg-roman-bg px-4 py-3 text-left transition-colors hover:border-roman-primary disabled:opacity-60"
                    >
                      <span className="font-semibold text-roman-text">
                        {enviando === escolha.id ? 'Registrando…' : escolha.rotulo}
                      </span>
                      <span className="text-xs text-roman-text-sub">{escolha.ajuda}</span>
                    </button>
                  ))}
                </div>

                {erro && <p className="mt-4 text-sm text-roman-danger">{erro}</p>}
              </>
            )}

            {pergunta.convidado.nome && (
              <p className="mt-6 border-t border-roman-border pt-4 text-xs text-roman-text-sub">
                Você é {pergunta.convidado.nome}. Se não for você, ignore este e-mail.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Registrado({
  pergunta,
  aoDesfazer,
  enviando,
}: {
  pergunta: Pergunta;
  aoDesfazer: () => void;
  enviando: string | null;
}) {
  const faltou = pergunta.estado === 'faltou';
  return (
    <>
      <h1 className="text-xl font-semibold text-roman-text">Registrado, obrigado.</h1>
      <p className="mt-2 text-sm text-roman-text-sub">
        {faltou
          ? 'A manutenção vai ser avisada e cobrar o fornecedor.'
          : 'A manutenção já está vendo.'}
      </p>

      {pergunta.podeDesfazer && (
        <button
          type="button"
          disabled={Boolean(enviando)}
          onClick={aoDesfazer}
          className="mt-5 flex w-full flex-col items-start rounded-lg border border-roman-border bg-roman-bg px-4 py-3 text-left transition-colors hover:border-roman-primary disabled:opacity-60"
        >
          <span className="font-semibold text-roman-text">
            {enviando ? 'Corrigindo…' : 'Apareceu depois'}
          </span>
          <span className="text-xs text-roman-text-sub">corrige o registro</span>
        </button>
      )}

      <p className="mt-5 text-xs text-roman-text-sub">
        {[pergunta.sede, horaLegivel(pergunta.respondidoEm), pergunta.respondidoPor && `registrado por ${pergunta.respondidoPor}`]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </>
  );
}
