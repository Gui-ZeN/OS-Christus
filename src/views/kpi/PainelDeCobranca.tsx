import { useEffect, useMemo, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import { fetchCommitments, type HydratedCommitment } from '../../services/commitmentsApi';
import { metricasDeCobranca } from '../../../api/_lib/metricasDeCobranca.js';

/**
 * A LINHA DE BASE DA COBRANÇA — o que a semana de papel ia medir.
 *
 * O plano original pedia cinco dias de anotação à mão. O dono cortou: "o próprio
 * sistema deveria dar isso fácil, ninguém merece papel". Está certo — o botão
 * Cobrar já grava tentativa, desfecho e horário, que são as colunas da folha.
 *
 * Duas decisões que este quadro carrega:
 *
 * 1. TUDO EM TAXA, além do total. O volume de OS muda de mês para mês; comparar
 *    totais faz o indicador mentir sozinho — um mês com metade das visitas tem
 *    metade das cobranças sem nada ter melhorado.
 *
 * 2. O NÚMERO É PISO, NÃO TOTAL, e o rodapé diz isso em voz alta. Cobrança feita
 *    fora do sistema (ligação do celular, conversa no corredor) não aparece aqui.
 *    Um painel que finge medir tudo é pior que painel nenhum: faz a operação
 *    parecer mais leve do que é, justamente para quem decide o orçamento dela.
 */

/**
 * Os compromissos só chegam dos últimos 30 dias (a rota busca por faixa num campo
 * só, sem índice composto). Fora dessa janela o quadro mostraria zero — e zero e
 * "não temos o dado" são coisas diferentes, então a tela diz qual das duas é.
 */
const JANELA_EM_DIAS = 30;

type Metricas = ReturnType<typeof metricasDeCobranca>;

function Numero({ rotulo, valor, sufixo = '', ajuda }: { rotulo: string; valor: number | null; sufixo?: string; ajuda?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub">{rotulo}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-roman-text-main">
        {valor === null ? '—' : `${valor}${sufixo}`}
      </div>
      {ajuda && <p className="mt-1 text-xs text-roman-text-sub">{ajuda}</p>}
    </div>
  );
}

export function PainelDeCobranca({
  inicio,
  fim,
  ticketIds,
}: {
  inicio: Date;
  fim: Date;
  /** As OS do recorte da tela, ou `null` quando nenhum filtro está ligado. */
  ticketIds: string[] | null;
}) {
  const [commitments, setCommitments] = useState<HydratedCommitment[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [quemCobrou, setQuemCobrou] = useState('');

  useEffect(() => {
    let ativo = true;
    fetchCommitments()
      .then(lista => ativo && setCommitments(lista))
      .catch(() => ativo && setErro('Não foi possível carregar as visitas.'));
    return () => {
      ativo = false;
    };
  }, []);

  /**
   * O recorte real é a INTERSEÇÃO do período escolhido com a janela que temos.
   * Sem isso, escolher "Janeiro" traria zeros com cara de resultado.
   */
  const { de, ate, recortado } = useMemo(() => {
    const limite = new Date(Date.now() - JANELA_EM_DIAS * 24 * 60 * 60 * 1000);
    const de = inicio.getTime() < limite.getTime() ? limite : inicio;
    return { de, ate: fim, recortado: de !== inicio };
  }, [inicio, fim]);

  const m: Metricas | null = useMemo(
    () =>
      commitments
        ? metricasDeCobranca({ commitments, de, ate, ticketIds, porEmail: quemCobrou || null })
        : null,
    [commitments, de, ate, ticketIds, quemCobrou]
  );

  /**
   * Quem some do recorte perde a seleção junto.
   *
   * Sem isto, trocar a sede deixaria o nome escolhido preso num quadro que ficou
   * todo zero — e o zero pareceria resultado, não filtro fora de contexto.
   */
  useEffect(() => {
    if (quemCobrou && m && !m.quemCobrou.includes(quemCobrou)) setQuemCobrou('');
  }, [m, quemCobrou]);

  const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-medium text-roman-text-main">Cobrança de quem não apareceu</h2>
        <div className="flex flex-wrap items-center gap-3">
          {m && m.quemCobrou.length > 0 && (
            <select
              aria-label="Filtrar por quem cobrou"
              value={quemCobrou}
              onChange={event => setQuemCobrou(event.target.value)}
              className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-main"
            >
              <option value="">Toda a equipe</option>
              {m.quemCobrou.map(email => (
                <option key={email} value={email}>
                  {email}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-roman-text-sub">
            {recortado ? `só temos de ${dataCurta(de)} a ${dataCurta(ate)}` : `${dataCurta(de)} a ${dataCurta(ate)}`}
          </span>
        </div>
      </div>

      {erro && <p className="mt-4 text-sm text-roman-danger">{erro}</p>}
      {!erro && !m && <p className="mt-4 text-sm text-roman-text-sub">Carregando as visitas…</p>}

      {m && m.visitas === 0 && (
        <p className="mt-4 text-sm text-roman-text-sub">
          {ticketIds && ticketIds.length === 0
            ? 'Nenhuma OS passa nos filtros escolhidos.'
            : 'Nenhuma visita marcada neste recorte — não há o que cobrar.'}
        </p>
      )}

      {m && m.visitas > 0 && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            <Numero
              rotulo="Visitas"
              valor={m.visitas}
              ajuda={quemCobrou ? `${m.faltas} sem comparecimento (toda a equipe)` : `${m.faltas} sem comparecimento`}
            />
            <Numero
              rotulo="Cobranças"
              valor={m.cobrancasConcluidas}
              // Abrir o WhatsApp não é ter cobrado: só desfecho registrado conta.
              // Com zero cobrança, "todas com desfecho" seria elogio ao nada.
              ajuda={
                m.semDesfecho > 0
                  ? `${m.semDesfecho} sem desfecho`
                  : m.cobrancasConcluidas > 0
                    ? 'todas com desfecho'
                    : 'ninguém foi cobrado no recorte'
              }
            />
            <Numero
              rotulo={quemCobrou ? 'Tentativas' : 'Por 100 visitas'}
              valor={quemCobrou ? m.tentativas : m.cobrancasPorCemVisitas}
              ajuda={
                quemCobrou
                  ? 'a visita não tem dono: não dá para dividir por visita'
                  : 'é esta taxa que se compara mês a mês'
              }
            />
            <Numero rotulo="Sem resposta" valor={m.percentualSemResposta} sufixo="%" ajuda="não atendeu ou não retornou" />
            <Numero rotulo="Viraram nova data" valor={m.percentualComNovaData} sufixo="%" ajuda="a cobrança resolveu" />
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-roman-border pt-4 text-sm text-roman-text-sub">
            <span>
              Mediana até o desfecho:{' '}
              <strong className="tabular-nums font-medium text-roman-text-main">
                {m.medianaAteODesfechoEmMinutos === null ? '—' : `${m.medianaAteODesfechoEmMinutos} min`}
              </strong>
            </span>
            <span>
              Visitas que exigiram segunda tentativa:{' '}
              <strong className="tabular-nums font-medium text-roman-text-main">{m.segundasTentativas}</strong>
            </span>
          </div>
        </>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-roman-text-sub">
        <PhoneCall size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Conta só o que passou pelo botão <strong className="font-medium">Cobrar</strong>. Ligação feita do celular não
          entra — o número aqui é piso, não total.
        </span>
      </p>
    </div>
  );
}
