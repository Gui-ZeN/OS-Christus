import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, CircleAlert, Clock, Hourglass, PauseCircle, Search, UserRound } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { FloatingToast } from '../components/ui/FloatingToast';
import { useApp } from '../context/AppContext';
import CobrancaDaFalta from './today/CobrancaDaFalta';
import { fetchDirectory, type DirectoryVendor } from '../services/directoryApi';
import { registrarDesfechoDaCobranca, registrarTentativaDeCobranca } from '../services/commitmentsApi';
import {
  AGENDA_GROUP,
  AGENDA_GROUP_LABEL,
  activeSuspension,
  buildAgenda,
  idleDays,
  resolvedAttentionOf,
  type AgendaGroup,
} from '../utils/agenda';
import {
  ATTENTION_STATE,
  DEFAULT_SUSPENSION_DAYS,
  SUSPENSION_REASON,
  SUSPENSION_REASON_LABEL,
  type SuspensionReason,
} from '../constants/agenda';
import {
  COMMITMENT_OUTCOME,
  COMMITMENT_OUTCOME_LABEL,
  COMMITMENT_STATE,
  type CommitmentOutcome,
  type CommitmentState,
} from '../constants/agenda';
import {
  cancelCommitment,
  confirmCommitment,
  createCommitment,
  fetchCommitments,
  type HydratedCommitment,
} from '../services/commitmentsApi';
import { TempoEmFortaleza } from './today/TempoEmFortaleza';
import { ATTENTION_KIND_LABEL, ATTENTION_KIND_WHY } from '../constants/attentionKind';
import { isTicketOpen } from '../constants/ticketLifecycle';
import { matchesSearch } from '../utils/search';
import { repairMojibake } from '../utils/text';
import type { NextAction, Ticket, TicketAttention } from '../types';
import { mensagemDeErro } from '../utils/errorMessage';
/**
 * HOJE — a tela central da versão nova.
 *
 * Ela responde *o que precisa acontecer hoje, onde e por quem*, no lugar de *em que
 * etapa está a OS*. Duzentas e poucas OS viram meia dúzia de linhas acionáveis.
 *
 * É a PORTA DE ENTRADA de quem opera (Admin/Gestor/Diretor) desde 13/08. Antes era
 * prévia de Admin, e a medição mostrou o preço: a agenda existia completa e tinha
 * 1 OS com data futura em 181 — os 7 gestores não enxergavam a tela onde a próxima
 * ação se define. `Usuario` continua fora: a tela dele é o portal de acompanhamento.
 *
 * Sem query nova: deriva de `tickets`, que já vive no contexto. A lógica de
 * agrupamento é pura e testada em `utils/agenda.ts`.
 */

const GROUP_ORDER: AgendaGroup[] = [
  AGENDA_GROUP.OVERDUE,
  AGENDA_GROUP.TODAY,
  AGENDA_GROUP.WAITING_SITE,
  AGENDA_GROUP.UPCOMING,
  AGENDA_GROUP.BLOCKED,
  AGENDA_GROUP.WAITING,
  AGENDA_GROUP.NO_ACTION,
];

const GROUP_HINT: Record<AgendaGroup, string> = {
  vencidas: 'a data passou e ninguém registrou desfecho',
  hoje: 'marcado para hoje',
  'aguardando-sede': 'o horário passou — a pergunta já foi enviada, ninguém precisa ligar',
  'proximos-7-dias': 'para se preparar, não para agir agora',
  impedidas: 'travadas por terceiro — continuam contando o tempo parado',
  esperando: 'espera legítima, com motivo e data para voltar — a revisão vence sozinha',
  'sem-proxima-acao': 'ninguém definiu o que acontece — ordenadas pelo tempo parado',
};

const GROUP_ICON: Record<AgendaGroup, React.ReactNode> = {
  vencidas: <CircleAlert size={14} />,
  hoje: <Clock size={14} />,
  'aguardando-sede': <Hourglass size={14} />,
  'proximos-7-dias': <CalendarClock size={14} />,
  impedidas: <PauseCircle size={14} />,
  esperando: <PauseCircle size={14} />,
  'sem-proxima-acao': <CircleAlert size={14} />,
};

/**
 * Cor por grupo — agora em TOKEN, não em cor crua.
 *
 * Antes eram `red-600`, `amber-500` e `slate-400` literais, escolhidos em 13/08
 * porque as tintas pastel (`bg-red-50/60`) sumiam no tema escuro. Resolvia aquele
 * problema e criava outro: cor crua não segue tema nenhum.
 *
 * O print do tema Rubronegro mostrou o preço. Lá o acento da marca É vermelho,
 * então o botão "Definir próxima ação" e a borda de "Vencidas" gritavam igual —
 * "isto se clica" e "isto está atrasado" viravam a mesma coisa. Contraste passava
 * nos dois; significado, não. É a advertência do Sol na prática: mesma luminância
 * preserva contraste, não preserva percepção.
 *
 * Com o token, o `danger` do Rubronegro virou âmbar e a separação volta.
 *
 * E `aguardando-sede` saiu do âmbar para neutro por causa do próprio texto que ele
 * exibe: "o horário passou — a pergunta já foi enviada, ninguém precisa ligar".
 * Grupo que declara não precisar de ação não devia vestir cor de alerta — e, com o
 * danger em âmbar, os dois ficariam a 5 graus de matiz um do outro.
 */
const GROUP_TONE: Record<AgendaGroup, string> = {
  vencidas: 'border-l-roman-danger bg-roman-danger/12',
  hoje: 'border-l-roman-primary',
  'aguardando-sede': 'border-l-roman-border-control',
  'proximos-7-dias': 'border-l-roman-border',
  impedidas: 'border-l-roman-text-sub bg-roman-text-sub/10',
  esperando: 'border-l-roman-border',
  'sem-proxima-acao': 'border-l-roman-border',
};

function horaCurta(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Fortaleza',
  }).format(date);
}

function dataCurta(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Fortaleza',
  }).format(date);
}

/** `datetime-local` fala no fuso do navegador — a operação inteira está em Fortaleza. */
function paraCampoLocal(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function emDias(base: Date, dias: number, hora: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

export function TodayView() {
  const { tickets, navigateTo, setActiveTicketId, updateTicket, currentUser, osBoardFilter, setOsBoardFilter } = useApp();
  const { toast, showToast } = useToast();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  // Compromissos vivem fora do `tickets` (uma visita atende várias OS) e por isso não
  // entram no polling global — esta tela busca os seus e pronto.
  const [compromissos, setCompromissos] = useState<HydratedCommitment[]>([]);
  const [erroCompromissos, setErroCompromissos] = useState('');

  const recarregarCompromissos = useCallback(async () => {
    try {
      setCompromissos(await fetchCommitments());
      setErroCompromissos('');
    } catch (e) {
      setErroCompromissos(mensagemDeErro(e, 'Falha ao carregar compromissos.'));
    }
  }, []);

  useEffect(() => {
    void recarregarCompromissos();
    // As OS chegam pelo polling global a cada 30s; os compromissos não. Sem este
    // intervalo, metade da tela ficava viva e metade congelada no instante em que
    // ela foi aberta — pior que as duas paradas. Cinco minutos porque a confirmação
    // da sede não é urgente ao segundo, e é uma requisição por tela aberta.
    const id = setInterval(() => void recarregarCompromissos(), 5 * 60_000);
    return () => clearInterval(id);
  }, [recarregarCompromissos]);

  const compromissoPorId = useMemo(
    () => new Map(compromissos.map(c => [c.id, c])),
    [compromissos]
  );

  /**
   * O relógio ANDA — mas um só por quadro.
   *
   * Um valor por render manteria a coerência (duas datas diferentes colocariam a mesma
   * OS em grupos distintos), só que congelava a tela na hora em que ela foi aberta. E
   * esta é justamente a tela que fica aberta o dia inteiro: com o relógio parado, a
   * visita que estourou a tolerância nunca aparecia em "Aguardando a sede", a ação
   * vencida nunca caía em "Vencidas", a suspensão nunca expirava — e depois da
   * meia-noite o cabeçalho ainda dizia ontem.
   *
   * Um minuto é folgado para tolerância de 30 e para a virada do dia.
   */
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const agenda = useMemo(() => buildAgenda(tickets, agora), [tickets, agora]);

  /**
   * A ponte entre o tempo e o trabalho: 26 das 178 OS da produção são problema de
   * água (15%). Sem esse número, o bloco de clima seria termômetro — e termômetro
   * numa tela de agenda é o mesmo enfeite que saiu do Início hoje.
   */
  const osDeAgua = useMemo(
    () => tickets.filter(t => t.waterIssue && isTicketOpen(t.status)).length,
    [tickets]
  );

  /** Abre a Gestão só com as de água. O filtro é de primeira classe lá, senão a
   *  pessoa chegaria numa lista inteira sem entender por que clicou. */
  const abrirAgua = useCallback(() => {
    setOsBoardFilter({
      search: '', sede: 'all', macroService: 'all', service: 'all', team: 'all',
      status: 'all', responsible: 'all', showClosed: false, bloqueadas: false,
      agua: true, ordem: 'parada',
    });
    navigateTo('os-board');
  }, [navigateTo, setOsBoardFilter]);

  const filtra = (lista: Ticket[]) =>
    lista.filter(t =>
      matchesSearch(
        `${t.id} ${repairMojibake(t.subject)} ${t.sede || ''} ${t.nextAction?.what || ''}`,
        busca
      )
    );

  const abrir = (id: string) => {
    setActiveTicketId(id);
    navigateTo('inbox');
  };

  /** `null` remove a próxima ação (a OS volta para o grupo do vazio, de propósito). */
  const salvarAcao = async (id: string, acao: NextAction | null) => {
    const ok = await updateTicket(id, { nextAction: acao });
    // `updateTicket` reverte o otimista sozinho e nunca lança; aqui só não fechamos
    // o editor, para o texto digitado não sumir junto com o erro.
    if (ok) setEditando(null);
    return ok;
  };

  /**
   * Corrige a proposta do sistema — sem virar formulário de novo.
   *
   * `resolution` não muda o cálculo: fica gravada para dizer se as regras prestam.
   * "Feito" e "não se aplica" somem da tela do mesmo jeito, mas significam coisas
   * opostas — um diz que a regra acertou e a pessoa resolveu; o outro, que a regra
   * classificou mal. Sem separar, não há como saber qual dos dois está crescendo.
   */
  const corrigirAtencao = async (
    ticket: Ticket,
    resolution: 'feito' | 'adiado' | 'nao-se-aplica',
    dueAt?: Date
  ) => {
    const sourceId = ticket.operationalAttention?.sourceId;
    if (!sourceId) {
      showToast('Esta sugestão não tem origem registrada — recarregue a página.', 4000);
      return false;
    }
    const ok = await updateTicket(ticket.id, {
      attentionOverride: {
        sourceId,
        dismissed: resolution !== 'adiado',
        dueAt: dueAt ?? null,
        resolution,
        changedBy: currentUser?.email,
        changedAt: new Date(),
      },
    });
    // O aviso mora AQUI, e não em cada botão, porque a falha é invisível de um jeito
    // particularmente cruel: `updateTicket` é otimista, então o cartão some na hora e
    // volta quando o PATCH falha e o estado é revertido. Sem esta linha, a pessoa vê a
    // sugestão piscar e voltar, clica de novo, e nada explica nada.
    if (!ok) {
      showToast(`Não foi possível registrar em ${ticket.id} — a sugestão continua na pauta.`, 5000);
    }
    return ok;
  };

  /**
   * Marca a próxima ação como VISITA DE FORNECEDOR: cria o compromisso e amarra os
   * dois. É o `commitmentId` que faz a OS cair em "Aguardando a sede" quando o
   * horário passa, em vez de continuar cobrando a gestora por algo que não é dela.
   */
  const marcarComoVisita = async (ticket: Ticket, acao: NextAction, fornecedor: string) => {
    const compromisso = await createCommitment({
      ticketIds: [ticket.id],
      startAt: acao.dueAt,
      vendorName: fornecedor,
      sede: ticket.sede || null,
      siteId: ticket.siteId || null,
    });
    setCompromissos(atual => [...atual, compromisso]);
    return compromisso.id;
  };

  const registrarConfirmacao = async (
    compromissoId: string,
    state: CommitmentState,
    outcome: CommitmentOutcome | null
  ) => {
    await confirmCommitment({ id: compromissoId, state, outcome });
    await recarregarCompromissos();
  };

  /**
   * A visita foi DESMARCADA — nem aconteceu, nem falhou.
   *
   * O estado `cancelado` existia no domínio e no servidor desde sempre; faltava o
   * botão. Sem ele, quem operava só tinha "veio" ou "não veio", então uma visita
   * desmarcada na terça virava "não veio" na quinta — e "não veio" é o sinal que a
   * agenda usa para apontar fornecedor que falha. Cada cancelamento registrado como
   * falta sujava a métrica de quem realmente falhou.
   */
  /**
   * O cadastro do fornecedor é TEXTO LIVRE ("falar com o João 99999-8888"), então o
   * contato é buscado no diretório e pode simplesmente não dar um telefone — e aí o
   * botão de cobrar aparece apagado, em vez de abrir conversa com número inventado.
   */
  const [fornecedores, setFornecedores] = useState<DirectoryVendor[]>([]);

  // O diretório entra uma vez: sem ele o botão de cobrar não tem para onde ligar.
  // Falha silenciosa é aceitável aqui — o botão fica apagado, que é o mesmo estado
  // de um fornecedor sem telefone, e a tela inteira não cai por causa disso.
  useEffect(() => {
    let ativo = true;
    void fetchDirectory()
      .then(d => { if (ativo) setFornecedores(d.vendors || []); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  const contatoDoFornecedor = (vendorId?: string | null, vendorName?: string | null) => {
    const achado =
      fornecedores.find(v => v.id === vendorId) ||
      fornecedores.find(v => v.name === vendorName);
    return achado?.contact || null;
  };

  const cobrarFornecedor = async (compromissoId: string) => {
    await registrarTentativaDeCobranca(compromissoId);
    await recarregarCompromissos();
    // Não diz "cobrado": abrir a conversa não é ter cobrado, e o texto do aviso é
    // o primeiro lugar onde essa confusão nasceria.
    showToast('Tentativa registrada. Diga o desfecho quando souber.');
  };

  const registrarDesfecho = async (compromissoId: string, desfecho: string) => {
    await registrarDesfechoDaCobranca(compromissoId, desfecho);
    await recarregarCompromissos();
    showToast('Cobrança registrada.');
  };

  const cancelarCompromisso = async (compromissoId: string) => {
    await cancelCommitment(compromissoId);
    await recarregarCompromissos();
    showToast('Visita cancelada.');
  };

  /** `null` retoma a OS: ela volta a cobrar próxima ação na hora. */
  const salvarSuspensao = async (id: string, attention: TicketAttention | null) => {
    const ok = await updateTicket(id, { attention });
    if (ok) setEditando(null);
    return ok;
  };

  const dataDeHoje = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'America/Fortaleza',
  }).format(agora);

  return (
    <div className="flex h-full flex-col bg-roman-bg">
      <header className="flex flex-wrap items-center gap-4 border-b border-roman-border bg-roman-surface px-4 py-4 md:px-6">
        <div>
          <h1 className="font-serif text-xl font-medium text-roman-text-main">Hoje</h1>
          <p className="font-serif italic text-roman-text-sub">{dataDeHoje}</p>
        </div>
        <div className="relative ml-auto">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-roman-text-sub"
          />
          <input
            type="text"
            value={busca}
            onChange={event => setBusca(event.target.value)}
            placeholder="buscar OS, sede, ação…"
            className="w-60 rounded-sm border border-roman-border bg-roman-bg py-1.5 pl-8 pr-2.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
        </div>
        {erroCompromissos && (
          <span className="rounded-sm border border-roman-danger/35 bg-roman-danger/12 px-2 py-1 text-xs text-roman-danger">
            {erroCompromissos}
          </span>
        )}
        <TempoEmFortaleza aoFiltrarAgua={abrirAgua} osDeAgua={osDeAgua} />
      </header>

      {/* A FILEIRA DE CONTADORES SAIU (13/08).
          Medido a 1366×768: ela ocupava 117px — 15% da tela — e empurrava o primeiro
          dado para 254px, ou seja, um TERÇO da altura gasto antes de aparecer
          qualquer OS. Só 6 dos 13 cartões cabiam sem rolar.
          E o que ela mostrava já estava logo abaixo: cada seção traz o próprio total
          ao lado do título, a 30px de distância. Eram quatro números repetidos,
          NENHUM clicável e dois deles zero — as duas regras que tiramos do Início
          hoje (zero não aparece; número é porta) nunca tinham passado por aqui. */}

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-10 md:px-6">
        {/* O PASSIVO COMO NÚMERO, NÃO COMO LISTA.
            São 154 OS paradas sem responsável hoje. Item a item, elas cairiam quase
            todas em "Vencidas" e afogariam as atenções que são trabalho de verdade.
            Como número, cabem numa linha e se resolvem em lote na Gestão — que é
            onde estão o filtro "Sem responsável" e a coluna clicável.
            Quando o passivo cair abaixo de MAX_SEM_RESPONSAVEL_NA_PAUTA, esta linha
            some sozinha e as OS voltam a aparecer uma a uma. */}
        {agenda.semResponsavel.agrupado && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-sm border border-roman-primary/35 bg-roman-primary/12 p-4">
            <UserRound size={16} className="text-roman-primary" />
            <div className="min-w-[14rem] flex-1">
              <div className="font-medium text-roman-primary">
                {agenda.semResponsavel.total} OS paradas sem responsável
              </div>
              <p className="text-sm text-roman-primary">
                Não estão na lista abaixo de propósito: é passivo acumulado, e ele se resolve
                em lote — não uma por dia.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOsBoardFilter({ ...osBoardFilter, responsible: 'none' });
                navigateTo('os-board');
              }}
              className="inline-flex items-center gap-1.5 rounded-sm bg-roman-primary px-3 py-2 text-sm font-medium text-roman-on-primary hover:bg-roman-primary"
            >
              Definir responsáveis <ArrowRight size={14} />
            </button>
          </div>
        )}

        {GROUP_ORDER.map(grupo => {
          const itens = filtra(agenda.groups[grupo]);
          if (itens.length === 0) return null;
          return (
            <section key={grupo}>
              <div className="mt-6 mb-2 flex items-baseline gap-2">
                <span className="text-roman-text-sub">{GROUP_ICON[grupo]}</span>
                <h2 className="font-serif text-base font-medium text-roman-text-main">
                  {AGENDA_GROUP_LABEL[grupo]}
                </h2>
                <span className="text-xs text-roman-text-sub">{GROUP_HINT[grupo]}</span>
                <span className="ml-auto text-xs text-roman-text-sub">{itens.length}</span>
              </div>
              {/* CARTÕES EM COLUNAS, não empilhados.
                  Medido a 1366×768 com 14 cartões: cada um ocupava 1247px de largura
                  para caber no máximo 272px de texto (mediana 161px) — 80% da largura
                  vazia, enquanto a pessoa rolava para ver o resto. Era o desperdício
                  grande; os 117px de contadores que tirei antes eram o pequeno.
                  Três colunas de ~400px acomodam a maior linha (272px + respiro) e
                  triplicam o que cabe na mesma altura. Uma coluna abaixo de 768px. */}
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {itens.map(ticket => (
                <Cartao
                  key={ticket.id}
                  ticket={ticket}
                  grupo={grupo}
                  agora={agora}
                  onAbrir={abrir}
                  editando={editando === ticket.id}
                  onEditar={() => setEditando(editando === ticket.id ? null : ticket.id)}
                  onSalvar={acao => salvarAcao(ticket.id, acao)}
                  onSuspender={attention => salvarSuspensao(ticket.id, attention)}
                  compromisso={
                    ticket.nextAction?.commitmentId
                      ? compromissoPorId.get(ticket.nextAction.commitmentId) || null
                      : null
                  }
                  onConfirmar={registrarConfirmacao}
                  onCancelar={cancelarCompromisso}
                  onCobrar={cobrarFornecedor}
                  onDesfechoDaCobranca={registrarDesfecho}
                  contatoDoFornecedor={contatoDoFornecedor}
                  onCorrigir={(resolution, dueAt) => corrigirAtencao(ticket, resolution, dueAt)}
                  onVirarVisita={(acao, fornecedor) => marcarComoVisita(ticket, acao, fornecedor)}
                  autorEmail={currentUser?.email}
                  autorNome={currentUser?.name}
                />
              ))}
              </div>
            </section>
          );
        })}

        {/* DOIS vazios diferentes, e antes só um deles existia.
            "Nenhuma OS carregada" cobre o caso de não ter dado nenhum. Não cobria o
            caso de a BUSCA não achar: cada grupo devolve `null` quando fica vazio,
            então digitar algo que não existe deixava a tela em branco — só o
            cabeçalho e o bloco de tempo. Medido: o texto da tela caía de 3.165 para
            48 caracteres, sem uma palavra explicando.

            Tela em branco é indistinguível de defeito, e esta é a porta de entrada
            de quem opera. A Gestão já dizia "Nenhuma OS corresponde aos filtros";
            aqui não dizia nada. */}
        {tickets.length === 0 ? (
          <p className="p-10 text-center text-roman-text-sub">Nenhuma OS carregada.</p>
        ) : GROUP_ORDER.every(grupo => filtra(agenda.groups[grupo]).length === 0) ? (
          <div className="p-10 text-center">
            <p className="text-roman-text-sub">
              {busca.trim()
                ? `Nenhuma OS da agenda corresponde a “${busca.trim()}”.`
                : 'Nada na agenda — nenhuma OS pede ação hoje.'}
            </p>
            {busca.trim() && (
              <button
                onClick={() => setBusca('')}
                className="mt-3 inline-flex min-h-6 items-center text-sm font-medium text-roman-primary hover:underline"
              >
                Limpar a busca
              </button>
            )}
          </div>
        ) : null}
      </div>
      <FloatingToast message={toast} />
    </div>
  );
}

function Cartao({
  ticket,
  grupo,
  agora,
  onAbrir,
  editando,
  onEditar,
  onSalvar,
  onSuspender,
  compromisso,
  onConfirmar,
  onCancelar,
  onCobrar,
  onDesfechoDaCobranca,
  contatoDoFornecedor,
  onCorrigir,
  onVirarVisita,
  autorEmail,
  autorNome,
}: {
  ticket: Ticket;
  grupo: AgendaGroup;
  agora: Date;
  onAbrir: (id: string) => void;
  editando: boolean;
  onEditar: () => void;
  onSalvar: (acao: NextAction | null) => Promise<boolean>;
  onSuspender: (attention: TicketAttention | null) => Promise<boolean>;
  compromisso: HydratedCommitment | null;
  onConfirmar: (id: string, state: CommitmentState, outcome: CommitmentOutcome | null) => Promise<void>;
  onCancelar: (id: string) => Promise<void>;
  /** Cobrança: a tentativa abre a conversa; o desfecho é o que conta como atuação. */
  onCobrar: (id: string) => Promise<void>;
  onDesfechoDaCobranca: (id: string, desfecho: string) => Promise<void>;
  /** O cadastro do fornecedor é texto livre — pode não render telefone utilizável. */
  contatoDoFornecedor: (vendorId?: string | null, vendorName?: string | null) => string | null;
  onCorrigir: (resolution: 'feito' | 'adiado' | 'nao-se-aplica', dueAt?: Date) => Promise<boolean>;
  onVirarVisita: (acao: NextAction, fornecedor: string) => Promise<string>;
  autorEmail?: string;
  autorNome?: string;
}) {
  const acao = resolvedAttentionOf(ticket);
  const manual = ticket.nextAction;
  const parado = idleDays(ticket, agora);
  const suspensao = activeSuspension(ticket, agora);

  return (
    <div
      className={`rounded-xl border border-l-[3px] border-roman-border bg-roman-surface px-4 py-3 ${GROUP_TONE[grupo]}`}
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAbrir(ticket.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onAbrir(ticket.id);
          }
        }}
        className="min-w-0 cursor-pointer rounded-sm focus:outline-none focus:ring-1 focus:ring-roman-primary"
      >
        {/* A AÇÃO é o título, não o assunto da OS: a tela responde "o que fazer",
            e o assunto vira contexto embaixo.

            O peso passou de 500 para 600 porque o código contradizia este comentário:
            medido, o número da OS — que é contexto, na linha de baixo — vinha em 600 e
            o título em 500. O item mais pesado do cartão era o menos importante. */}
        <div className="font-semibold text-roman-text-main">
          {suspensao
            ? SUSPENSION_REASON_LABEL[suspensao.reason]
            : acao?.what || (acao?.kind && ATTENTION_KIND_LABEL[acao.kind]) || 'Definir a próxima ação'}
        </div>
        {/* Toda proposta sabe se explicar. Foi o critério para abrir a tela: sem o
            "apareci por causa disto", a pessoa não sabe se a sugestão faz sentido e
            aprende a ignorar a fila. */}
        {acao?.proposta && acao.kind && (
          <div className="mt-0.5 text-[11px] italic text-roman-text-sub">
            sugestão do sistema — {ATTENTION_KIND_WHY[acao.kind]}
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-roman-text-sub">
          {/* Já se distingue por DUAS coisas — a fonte monoespaçada e a cor principal
              contra o cinza do resto da linha. O 600 era um terceiro sinal para o
              mesmo fim, e ele roubava a ênfase do título. */}
          <span className="font-mono font-medium text-roman-text-main">{ticket.id}</span>
          <span>· {ticket.sede || 'sem sede'}</span>
          <span className="truncate">· {repairMojibake(ticket.subject)}</span>
          {suspensao?.note && <span className="truncate">· {suspensao.note}</span>}
        </div>
        {manual?.ownerName && (
          <div className="mt-1 text-xs text-roman-text-sub">responsável: {manual.ownerName}</div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
        {suspensao ? (
          <span className="text-xs font-medium tabular-nums text-roman-text-sub">
            volta em {dataCurta(suspensao.reviewAt)}
          </span>
        ) : acao?.dueAt ? (
          <span
            className={`text-xs font-medium tabular-nums ${
              grupo === AGENDA_GROUP.OVERDUE ? 'text-roman-danger' : 'text-roman-text-sub'
            }`}
          >
            {grupo === AGENDA_GROUP.TODAY || grupo === AGENDA_GROUP.WAITING_SITE
              ? horaCurta(acao.dueAt)
              : dataCurta(acao.dueAt)}
          </span>
        ) : (
          // Sem data, o que importa é HÁ QUANTO TEMPO está assim.
          <span className="text-xs font-medium text-roman-primary">parada há {parado} dias</span>
        )}
        <button
          type="button"
          onClick={onEditar}
          className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
            acao
              ? 'border-roman-border text-roman-text-sub hover:border-roman-primary hover:text-roman-primary'
              : 'border-roman-primary bg-roman-primary font-medium text-roman-on-primary hover:opacity-90'
          }`}
        >
          {suspensao
            ? editando
              ? 'Fechar'
              : 'Rever'
            : acao
              ? editando
                ? 'Fechar'
                : 'Alterar'
              : 'Definir próxima ação'}
        </button>
      </div>
      </div>

      {acao?.proposta && !suspensao && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-roman-border pt-2">
          <span className="text-[11px] text-roman-text-sub">esta sugestão:</span>
          <button
            type="button"
            onClick={() => void onCorrigir('feito')}
            className="rounded-sm border border-roman-border px-2 py-0.5 text-[11px] text-roman-text-main transition-colors hover:border-roman-primary"
          >
            Feito
          </button>
          <button
            type="button"
            onClick={() => void onCorrigir('adiado', emDias(agora, 1, 9))}
            className="rounded-sm border border-roman-border px-2 py-0.5 text-[11px] text-roman-text-main transition-colors hover:border-roman-primary"
          >
            Amanhã
          </button>
          <button
            type="button"
            onClick={() => void onCorrigir('adiado', emDias(agora, 3, 9))}
            className="rounded-sm border border-roman-border px-2 py-0.5 text-[11px] text-roman-text-main transition-colors hover:border-roman-primary"
          >
            +3 dias
          </button>
          <button
            type="button"
            onClick={() => void onCorrigir('nao-se-aplica')}
            className="ml-auto text-[11px] text-roman-text-sub underline underline-offset-2 hover:text-roman-danger"
          >
            Não se aplica
          </button>
        </div>
      )}

      {/* A pergunta que elimina a ligação de verificação. Aparece sozinha quando o
          horário combinado passou e ninguém disse nada. */}
      {compromisso && compromisso.effectiveState === COMMITMENT_STATE.UNCONFIRMED && (
        <ConfirmacaoDaVisita compromisso={compromisso} onConfirmar={onConfirmar} onCancelar={onCancelar} />
      )}

      {/* Antes da hora: a visita ainda vai acontecer, e pode ser desmarcada. Sem
          isto, quem soubesse na terça que a visita de quinta caiu não tinha o que
          fazer além de esperar o prazo vencer para responder "não veio". */}
      {compromisso && compromisso.effectiveState === COMMITMENT_STATE.SCHEDULED && (
        <VisitaAgendada compromisso={compromisso} onCancelar={onCancelar} />
      )}

      {/* Falta confirmada é o único lugar onde a cobrança aparece: cobrar quem
          talvez tenha ido é o erro que o sistema foi desenhado para não cometer. */}
      {compromisso && compromisso.effectiveState === COMMITMENT_STATE.MISSED && (
        <CobrancaDaFalta
          compromisso={{
            id: compromisso.id,
            vendorName: compromisso.vendorName,
            vendorContact: contatoDoFornecedor(compromisso.vendorId, compromisso.vendorName),
            startAtLabel: compromisso.startAt ? dataCurta(compromisso.startAt) : null,
            ticketIds: compromisso.ticketIds,
            assunto: ticket.subject,
            local: ticket.sede || null,
            cobrancas: (compromisso as { cobrancas?: { desfecho?: string | null }[] }).cobrancas,
          }}
          quemCobra={autorNome || ''}
          onTentativa={onCobrar}
          onDesfecho={onDesfechoDaCobranca}
        />
      )}

      {compromisso && compromisso.effectiveState === COMMITMENT_STATE.ARRIVED && (
        <p className="mt-2 border-t border-roman-border pt-2 text-xs text-roman-text-sub">
          {compromisso.vendorName || 'O fornecedor'} compareceu ·{' '}
          <strong className="text-roman-text-main">
            {compromisso.outcome ? COMMITMENT_OUTCOME_LABEL[compromisso.outcome] : 'sem desfecho'}
          </strong>
        </p>
      )}

      {editando && (
        <EditorDeAcao
          acao={manual}
          suspensao={suspensao}
          agora={agora}
          autorEmail={autorEmail}
          autorNome={autorNome}
          onSalvar={onSalvar}
          onSuspender={onSuspender}
          onVirarVisita={onVirarVisita}
          onCancelar={onEditar}
        />
      )}
    </div>
  );
}

/**
 * Definir a próxima ação em dois toques: uma frase e um "quando".
 *
 * Os atalhos existem porque o custo de registrar é o que decide se a regra única
 * sobrevive ao dia a dia — se exigir abrir calendário, ninguém preenche.
 */
function EditorDeAcao({
  acao,
  suspensao,
  agora,
  autorEmail,
  autorNome,
  onSalvar,
  onSuspender,
  onVirarVisita,
  onCancelar,
}: {
  acao: NextAction | null | undefined;
  suspensao: TicketAttention | null;
  agora: Date;
  autorEmail?: string;
  autorNome?: string;
  onSalvar: (acao: NextAction | null) => Promise<boolean>;
  onSuspender: (attention: TicketAttention | null) => Promise<boolean>;
  onVirarVisita: (acao: NextAction, fornecedor: string) => Promise<string>;
  onCancelar: () => void;
}) {
  const [oQue, setOQue] = useState(acao?.what || '');
  const [quando, setQuando] = useState(
    paraCampoLocal(acao?.dueAt ? new Date(acao.dueAt) : emDias(agora, 0, 14))
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [suspendendo, setSuspendendo] = useState(false);
  const [ehVisita, setEhVisita] = useState(Boolean(acao?.commitmentId));
  const [fornecedor, setFornecedor] = useState('');
  const [motivo, setMotivo] = useState<SuspensionReason>(
    suspensao?.reason || SUSPENSION_REASON.WAITING_MATERIAL
  );
  const [voltaEm, setVoltaEm] = useState(
    paraCampoLocal(suspensao?.reviewAt || emDias(agora, DEFAULT_SUSPENSION_DAYS, 9))
  );

  const atalhos: Array<[string, Date]> = [
    ['Hoje 14h', emDias(agora, 0, 14)],
    ['Amanhã 9h', emDias(agora, 1, 9)],
    ['Em 3 dias', emDias(agora, 3, 9)],
    ['Em 7 dias', emDias(agora, 7, 9)],
  ];

  const submeter = async (event: React.FormEvent) => {
    event.preventDefault();
    const texto = oQue.trim();
    const data = new Date(quando);
    if (!texto) return setErro('Escreva o que vai acontecer.');
    if (Number.isNaN(data.getTime())) return setErro('Data inválida.');

    setErro('');
    setSalvando(true);
    const nova: NextAction = {
      what: texto,
      dueAt: data,
      // Preserva quem definiu a ação original; só a primeira definição carimba autor.
      ownerEmail: acao?.ownerEmail ?? autorEmail,
      ownerName: acao?.ownerName ?? autorNome,
      commitmentId: acao?.commitmentId ?? null,
      createdAt: acao?.createdAt ?? new Date(),
      createdBy: acao?.createdBy ?? autorEmail,
    };

    // O compromisso nasce ANTES da ação: se ele falhar, a ação não é salva prometendo
    // uma confirmação da sede que nunca vai existir.
    if (ehVisita && !nova.commitmentId) {
      try {
        nova.commitmentId = await onVirarVisita(nova, fornecedor.trim());
      } catch (e) {
        setSalvando(false);
        return setErro(mensagemDeErro(e, 'Não foi possível criar a visita.'));
      }
    }

    const ok = await onSalvar(nova);
    setSalvando(false);
    if (!ok) setErro('Não foi possível salvar. Tente de novo.');
  };

  const remover = async () => {
    setSalvando(true);
    const ok = await onSalvar(null);
    setSalvando(false);
    if (!ok) setErro('Não foi possível remover.');
  };

  const suspender = async () => {
    const data = new Date(voltaEm);
    if (Number.isNaN(data.getTime())) return setErro('Data de revisão inválida.');
    if (data.getTime() <= agora.getTime()) return setErro('A revisão precisa ser no futuro.');
    setErro('');
    setSalvando(true);
    const ok = await onSuspender({
      state: ATTENTION_STATE.SUSPENDED,
      reason: motivo,
      reviewAt: data,
      setBy: autorEmail,
      setByName: autorNome,
      setAt: new Date(),
    });
    setSalvando(false);
    if (!ok) setErro('Não foi possível suspender.');
  };

  const retomar = async () => {
    setSalvando(true);
    const ok = await onSuspender(null);
    setSalvando(false);
    if (!ok) setErro('Não foi possível retomar.');
  };

  if (suspensao && !suspendendo) {
    return (
      <div className="mt-3 border-t border-roman-border pt-3">
        <p className="text-sm text-roman-text-main">
          Suspensa por <strong>{SUSPENSION_REASON_LABEL[suspensao.reason]}</strong> até{' '}
          {dataCurta(suspensao.reviewAt)}
          {suspensao.setByName ? ` · por ${suspensao.setByName}` : ''}
        </p>
        <p className="mt-1 text-xs text-roman-text-sub">
          Na data da revisão ela volta sozinha para "sem próxima ação" — ninguém precisa
          lembrar de retomar.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={retomar}
            disabled={salvando}
            className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Retomar agora
          </button>
          <button
            type="button"
            onClick={() => setSuspendendo(true)}
            className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
          >
            Mudar motivo ou data
          </button>
          {erro && <span className="text-xs text-roman-danger">{erro}</span>}
        </div>
      </div>
    );
  }

  if (suspendendo) {
    return (
      <div className="mt-3 border-t border-roman-border pt-3">
        <label className="text-xs text-roman-text-sub" htmlFor="motivo-suspensao">
          Por que esta OS fica parada?
        </label>
        <select
          id="motivo-suspensao"
          value={motivo}
          onChange={event => setMotivo(event.target.value as SuspensionReason)}
          className="mt-1 w-full rounded-sm border border-roman-border bg-roman-bg px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
        >
          {Object.values(SUSPENSION_REASON).map(valor => (
            <option key={valor} value={valor}>
              {SUSPENSION_REASON_LABEL[valor]}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-roman-text-sub">Rever em</span>
          {[7, 15, 30].map(dias => (
            <button
              key={dias}
              type="button"
              onClick={() => setVoltaEm(paraCampoLocal(emDias(agora, dias, 9)))}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                voltaEm === paraCampoLocal(emDias(agora, dias, 9))
                  ? 'border-roman-primary bg-roman-parchment text-roman-primary'
                  : 'border-roman-border text-roman-text-sub hover:border-roman-primary'
              }`}
            >
              {dias} dias
            </button>
          ))}
          <input
            type="datetime-local"
            value={voltaEm}
            onChange={event => setVoltaEm(event.target.value)}
            className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-main outline-none focus:border-roman-primary"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={suspender}
            disabled={salvando}
            className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Suspender'}
          </button>
          <button
            type="button"
            onClick={() => setSuspendendo(false)}
            className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
          >
            Voltar
          </button>
          {erro && <span className="text-xs text-roman-danger">{erro}</span>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submeter} className="mt-3 border-t border-roman-border pt-3">
      <input
        type="text"
        value={oQue}
        autoFocus
        onChange={event => setOQue(event.target.value)}
        placeholder="O que vai acontecer? Ex.: cobrar a proposta do eletricista"
        className="w-full rounded-sm border border-roman-border bg-roman-bg px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {atalhos.map(([rotulo, data]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => setQuando(paraCampoLocal(data))}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              quando === paraCampoLocal(data)
                ? 'border-roman-primary bg-roman-parchment text-roman-primary'
                : 'border-roman-border text-roman-text-sub hover:border-roman-primary'
            }`}
          >
            {rotulo}
          </button>
        ))}
        <input
          type="datetime-local"
          value={quando}
          onChange={event => setQuando(event.target.value)}
          className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-main outline-none focus:border-roman-primary"
        />
      </div>
      {/* Marcar como visita é o que faz a OS cair em "Aguardando a sede" quando o
          horário passa, em vez de continuar cobrando quem não pode responder. */}
      <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-roman-text-sub">
        <input
          type="checkbox"
          checked={ehVisita}
          disabled={Boolean(acao?.commitmentId)}
          onChange={event => setEhVisita(event.target.checked)}
          className="accent-roman-primary"
        />
        É uma visita de fornecedor
        {ehVisita && !acao?.commitmentId && (
          <input
            type="text"
            value={fornecedor}
            onChange={event => setFornecedor(event.target.value)}
            placeholder="quem prometeu vir"
            className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
        )}
      </label>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => setSuspendendo(true)}
          className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary"
        >
          Suspender…
        </button>
        {acao && (
          <button
            type="button"
            onClick={remover}
            disabled={salvando}
            className="ml-auto text-xs text-roman-text-sub underline underline-offset-2 hover:text-roman-danger disabled:opacity-50"
          >
            Remover a próxima ação
          </button>
        )}
        {erro && <span className="text-xs text-roman-danger">{erro}</span>}
      </div>
    </form>
  );
}

/**
 * "O fornecedor apareceu?" — a pergunta que hoje custa uma ligação.
 *
 * Duas respostas de um toque. E quando a resposta é "veio", o desfecho é
 * OBRIGATÓRIO: sem ele, o fornecedor que chegou, olhou a pia, disse que faltou
 * material e foi embora ficaria registrado igual a quem resolveu.
 */
/**
 * A visita marcada, antes da hora — com a única ação que cabe aqui.
 *
 * Discreta de propósito: nada aconteceu ainda, então isto não é pauta. É só a
 * saída para quando a visita cai antes de acontecer. Fica em dois toques porque
 * cancelar é decisão, e um clique solto num cartão denso erra fácil.
 */
function VisitaAgendada({
  compromisso,
  onCancelar,
}: {
  compromisso: HydratedCommitment;
  onCancelar: (id: string) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const cancelar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await onCancelar(compromisso.id);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível cancelar.'));
      setConfirmando(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-roman-border pt-2 text-xs text-roman-text-sub">
      <span>
        {compromisso.vendorName || 'Visita'} às {horaCurta(compromisso.startAt)}
      </span>
      {confirmando ? (
        <>
          <span className="text-roman-text-main">Cancelar esta visita?</span>
          <button
            type="button"
            disabled={salvando}
            onClick={() => void cancelar()}
            className="inline-flex min-h-6 items-center rounded-sm border border-roman-danger/35 px-2 py-0.5 font-medium text-roman-danger transition-colors hover:bg-roman-danger/12 disabled:opacity-50"
          >
            {salvando ? 'Cancelando…' : 'Sim, foi desmarcada'}
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => setConfirmando(false)}
            className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-roman-text-main"
          >
            não
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="ml-auto inline-flex min-h-6 items-center underline underline-offset-2 hover:text-roman-text-main"
        >
          Foi desmarcada
        </button>
      )}
      {erro && <span className="text-roman-danger">{erro}</span>}
    </div>
  );
}

function ConfirmacaoDaVisita({
  compromisso,
  onConfirmar,
  onCancelar,
}: {
  compromisso: HydratedCommitment;
  onConfirmar: (id: string, state: CommitmentState, outcome: CommitmentOutcome | null) => Promise<void>;
  onCancelar: (id: string) => Promise<void>;
}) {
  const [pedindoDesfecho, setPedindoDesfecho] = useState(false);
  const [desfecho, setDesfecho] = useState<CommitmentOutcome>(COMMITMENT_OUTCOME.DONE);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const registrar = async (state: CommitmentState, outcome: CommitmentOutcome | null) => {
    setSalvando(true);
    setErro('');
    try {
      await onConfirmar(compromisso.id, state, outcome);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível registrar.'));
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await onCancelar(compromisso.id);
    } catch (e) {
      // O servidor recusa com 409 se o compromisso já foi encerrado por outra
      // pessoa enquanto esta tela estava aberta — a mensagem dele é mais precisa
      // que qualquer texto genérico daqui.
      setErro(mensagemDeErro(e, 'Não foi possível cancelar.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-2.5 rounded-sm border border-roman-primary/35 bg-roman-primary/12 p-3">
      <p className="text-sm text-roman-text-main">
        {compromisso.vendorName || 'O fornecedor'} tinha visita às {horaCurta(compromisso.startAt)}.
        A sede confirmou alguma coisa?
      </p>
      {!pedindoDesfecho ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={salvando}
            onClick={() => setPedindoDesfecho(true)}
            className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Veio
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => registrar(COMMITMENT_STATE.MISSED, null)}
            className="rounded-sm border border-roman-danger/35 px-3 py-1.5 text-sm text-roman-danger hover:bg-roman-danger/12 disabled:opacity-50"
          >
            Não veio
          </button>
          {/* A terceira resposta, que faltava. Sem ela, visita desmarcada só cabia
              em "não veio" — e "não veio" é o sinal de fornecedor que falha. */}
          <button
            type="button"
            disabled={salvando}
            onClick={() => cancelar()}
            className="rounded-sm border border-roman-border px-3 py-1.5 text-sm text-roman-text-sub transition-colors hover:border-roman-border-control hover:text-roman-text-main disabled:opacity-50"
          >
            Foi desmarcada
          </button>
          <span className="text-xs text-roman-text-sub">
            ainda sem resposta não é falta — só vira falta quando alguém disser
          </span>
          {erro && <span className="text-xs text-roman-danger">{erro}</span>}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-roman-text-sub" htmlFor={`desfecho-${compromisso.id}`}>
            E o que aconteceu?
          </label>
          <select
            id={`desfecho-${compromisso.id}`}
            value={desfecho}
            onChange={event => setDesfecho(event.target.value as CommitmentOutcome)}
            className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          >
            {Object.values(COMMITMENT_OUTCOME).map(valor => (
              <option key={valor} value={valor}>
                {COMMITMENT_OUTCOME_LABEL[valor]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={salvando}
            onClick={() => registrar(COMMITMENT_STATE.ARRIVED, desfecho)}
            className="rounded-sm bg-roman-primary px-3 py-1.5 text-sm font-medium text-roman-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Registrar'}
          </button>
          <button
            type="button"
            onClick={() => setPedindoDesfecho(false)}
            className="text-xs text-roman-text-sub underline underline-offset-2"
          >
            voltar
          </button>
          {erro && <span className="text-xs text-roman-danger">{erro}</span>}
        </div>
      )}
    </div>
  );
}
