import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * FILTRO DE MÚLTIPLA ESCOLHA — um `<select>` que aceita mais de uma resposta.
 *
 * A Gestão nasceu com seis `<select>` de escolha única, e isso decide a pergunta que
 * a fila consegue fazer: dá para ver o Sul 1, não dá para ver "Sul 1 e Sul 3". Quem
 * cuida de duas sedes tinha que filtrar uma, ler, filtrar a outra, ler de novo — e
 * somar de cabeça, que é onde a conta erra.
 *
 * ⚠️ LISTA VAZIA É "TODAS", e não "nenhuma". É a leitura que preserva o
 * comportamento de antes (abrir a tela mostra tudo) e a que evita o estado absurdo
 * de uma tela que não mostra nada porque ninguém marcou nada ainda. Mesma convenção
 * que o `InboxFilter` já usava.
 *
 * ⚠️ NÃO É `<select multiple>`. O nativo exige Ctrl+clique para marcar o segundo
 * item e desmarca tudo num clique solto — a pessoa perde a seleção sem entender por
 * quê. Caixas de seleção dizem o que fazem.
 */

export interface OpcaoDeFiltro {
  value: string;
  label: string;
}

interface Props {
  /** "Sede", "Equipe" — aparece no botão e no rótulo acessível. */
  rotulo: string;
  /** "todas"/"todos": a concordância é de quem chama, e português não perdoa. */
  todos: string;
  opcoes: OpcaoDeFiltro[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  /** As mesmas classes dos `<select>` vizinhos — o botão não pode parecer outra coisa. */
  className?: string;
}

export function FiltroMultiplo({ rotulo, todos, opcoes, selecionados, onChange, className = '' }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const painelId = useId();
  const [ancoraNaDireita, setAncoraNaDireita] = useState(false);

  /**
   * ⚠️ O PAINEL VIRA PARA A ESQUERDA QUANDO NÃO CABE.
   *
   * Medido no telefone (375px): ancorado sempre à esquerda, o último filtro da linha
   * abre em x=201 com 240px de largura e termina em 441 — 66px fora da tela, onde
   * ficam metade das opções. Não dá para resolver só com CSS: depende de onde o
   * botão parou depois que a linha quebrou.
   */
  useLayoutEffect(() => {
    if (!aberto) return;
    const r = painel.current?.getBoundingClientRect();
    if (r && r.right > window.innerWidth - 8) setAncoraNaDireita(true);
  }, [aberto]);

  // Fecha ao clicar fora e no Esc. Sem isso o painel fica aberto por cima da tabela
  // e a pessoa clica na linha de baixo achando que clicou na OS.
  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (event: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(event.target as Node)) setAberto(false);
    };
    const noEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAberto(false);
      // O foco volta para o botão: quem fechou pelo teclado ficaria sem posição na
      // página, e o próximo Tab recomeçaria do topo.
      botao.current?.focus();
    };
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', noEsc);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', noEsc);
    };
  }, [aberto]);

  const alterna = (value: string) =>
    onChange(selecionados.includes(value) ? selecionados.filter(v => v !== value) : [...selecionados, value]);

  /*
   * O resumo no botão. Com uma escolha vale o nome dela — é o que o `<select>`
   * mostrava, e trocar por "1 de 23" seria perder informação para ganhar simetria.
   * Com mais de uma, o denominador diz o tamanho do que ficou de fora: "3 de 23" e
   * "3 de 4" recortam de maneiras muito diferentes.
   */
  const resumo = (() => {
    if (selecionados.length === 0) return `${rotulo}: ${todos}`;
    if (selecionados.length === 1) {
      return `${rotulo}: ${opcoes.find(o => o.value === selecionados[0])?.label || selecionados[0]}`;
    }
    return `${rotulo}: ${selecionados.length} de ${opcoes.length}`;
  })();

  return (
    <div className="relative" ref={caixa}>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        aria-label={`Filtrar por ${rotulo.toLowerCase()}`}
        title={selecionados.length > 1 ? selecionados.map(v => opcoes.find(o => o.value === v)?.label || v).join(' · ') : undefined}
        className={`inline-flex max-w-56 items-center gap-1.5 ${className} ${
          selecionados.length > 0 ? 'border-roman-primary/45 text-roman-text-main' : ''
        }`}
      >
        <span className="truncate">{resumo}</span>
        <ChevronDown size={14} className="shrink-0 text-roman-text-sub" />
      </button>

      {aberto && (
        <div
          id={painelId}
          ref={painel}
          className={`absolute z-30 mt-1 max-h-72 w-60 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-sm border border-roman-border bg-roman-surface py-1 shadow-lg ${
            ancoraNaDireita ? 'right-0' : 'left-0'
          }`}
        >
          {/* "Todas" é uma linha da lista, e não um botão à parte: é para lá que a
              pessoa olha quando quer desfazer, e é onde ela estava no `<select>`. */}
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-roman-text-sub hover:bg-roman-border-light"
          >
            <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {selecionados.length === 0 && <Check size={12} className="text-roman-primary" />}
            </span>
            {todos.charAt(0).toUpperCase() + todos.slice(1)}
          </button>
          {opcoes.length === 0 && (
            <p className="px-3 py-1.5 text-sm text-roman-text-sub">Nada para filtrar aqui.</p>
          )}
          {opcoes.map(opcao => (
            <label
              key={opcao.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-roman-text-main hover:bg-roman-border-light"
            >
              <input
                type="checkbox"
                checked={selecionados.includes(opcao.value)}
                onChange={() => alterna(opcao.value)}
                className="h-3.5 w-3.5 shrink-0 accent-roman-primary"
              />
              <span className="truncate" title={opcao.label}>{opcao.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
