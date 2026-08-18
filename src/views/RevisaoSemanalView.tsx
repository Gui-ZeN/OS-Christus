import { useCallback, useEffect, useState } from 'react';

/**
 * A REVISÃO SEMANAL — a página do fechamento assistido.
 *
 * O e-mail diz "estas 7 OS não têm atividade há 30 dias" e traz até aqui. Encerrar
 * é a ação mais destrutiva do sistema, então nada acontece ao abrir: o e-mail não
 * encerra, a página não encerra sozinha, e cada linha só muda no toque.
 *
 * Tudo numa página só, e não uma por OS: a gestora resolve as sete de uma sentada.
 */

type Ordem = {
  id: string;
  assunto: string;
  sede: string;
  status: string;
  dias: number | null;
  encerradaAqui: boolean;
  podeDesfazer: boolean;
  adiadaAte: string | null;
};

const RESPOSTAS = [
  { id: 'encerrar', rotulo: 'Encerrar', ajuda: 'já foi resolvida' },
  { id: 'ainda-pendente', rotulo: 'Ainda pendente', ajuda: 'continua em aberto' },
  { id: 'ver-depois', rotulo: 'Ver depois', ajuda: 'some por 30 dias' },
] as const;

export default function RevisaoSemanalView({ token }: { token: string }) {
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [gestora, setGestora] = useState<{ nome: string | null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/tickets?route=revisao-pagina&token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!ativo) return;
        if (!r.ok) setErro(d?.error || 'Não foi possível abrir esta revisão.');
        else {
          setOrdens(d.ordens || []);
          setGestora(d.gestora || null);
        }
      } catch {
        if (ativo) setErro('Não foi possível abrir esta revisão. Verifique a conexão.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [token]);

  const responder = useCallback(
    async (ticketId: string, resposta: string) => {
      setEnviando(`${ticketId}:${resposta}`);
      setErro(null);
      try {
        const r = await fetch('/api/tickets?route=revisao-pagina', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ticketId, resposta }),
        });
        const d = await r.json();
        // Só muda a tela com o servidor confirmando — nunca por conta própria.
        if (r.ok) setOrdens(d.ordens || []);
        else setErro(d?.error || 'Não foi possível registrar.');
      } catch {
        setErro('Não foi possível registrar. Verifique a conexão e tente de novo.');
      } finally {
        setEnviando(null);
      }
    },
    [token]
  );

  const pendentes = ordens.filter(o => !o.encerradaAqui && !o.adiadaAte);

  return (
    <div className="min-h-screen bg-roman-bg px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-roman-text-sub">Serv3</div>

        {carregando && <p className="text-roman-text-sub">Abrindo a revisão…</p>}

        {!carregando && erro && ordens.length === 0 && (
          <div className="rounded-lg border border-roman-border bg-roman-surface p-5">
            <h1 className="text-lg font-semibold text-roman-text">Não deu para abrir</h1>
            <p className="mt-2 text-sm text-roman-text-sub">{erro}</p>
          </div>
        )}

        {ordens.length > 0 && (
          <div className="rounded-lg border border-roman-border bg-roman-surface p-5">
            <h1 className="text-xl font-semibold text-roman-text">
              {pendentes.length > 0
                ? `${pendentes.length} ${pendentes.length === 1 ? 'OS parada' : 'OS paradas'} há mais de 30 dias`
                : 'Tudo revisado. Obrigado.'}
            </h1>
            <p className="mt-1 text-sm text-roman-text-sub">
              {gestora?.nome ? `${gestora.nome}, n` : 'N'}ada é encerrado sem você dizer.
            </p>

            <div className="mt-6 divide-y divide-roman-border">
              {ordens.map(ordem => (
                <div key={ordem.id} className="py-4">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-roman-text">{ordem.id}</span>
                    <span className="text-xs text-roman-text-sub">
                      {[ordem.sede, ordem.dias !== null && `parada há ${ordem.dias} dias`].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-roman-text">{ordem.assunto}</p>

                  {ordem.encerradaAqui ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-roman-text-sub">Encerrada.</span>
                      {ordem.podeDesfazer && (
                        <button
                          type="button"
                          disabled={Boolean(enviando)}
                          onClick={() => responder(ordem.id, 'desfazer')}
                          className="rounded-lg border border-roman-border bg-roman-bg px-3 py-2 text-sm font-semibold text-roman-text transition-colors hover:border-roman-primary disabled:opacity-60"
                        >
                          {enviando === `${ordem.id}:desfazer` ? 'Reabrindo…' : 'Desfazer'}
                        </button>
                      )}
                    </div>
                  ) : ordem.adiadaAte ? (
                    <p className="mt-3 text-sm text-roman-text-sub">Volta a aparecer daqui a 30 dias.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {RESPOSTAS.map(resposta => (
                        <button
                          key={resposta.id}
                          type="button"
                          disabled={Boolean(enviando)}
                          onClick={() => responder(ordem.id, resposta.id)}
                          className="flex flex-col items-start rounded-lg border border-roman-border bg-roman-bg px-3 py-2 text-left transition-colors hover:border-roman-primary disabled:opacity-60"
                        >
                          <span className="text-sm font-semibold text-roman-text">
                            {enviando === `${ordem.id}:${resposta.id}` ? 'Registrando…' : resposta.rotulo}
                          </span>
                          <span className="text-xs text-roman-text-sub">{resposta.ajuda}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {erro && <p className="mt-4 text-sm text-roman-danger">{erro}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
