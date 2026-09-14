/**
 * OS RÓTULOS DO MODAL DE CATÁLOGO — e por que o modal existe.
 *
 * ⚠️ A TELA FOI CÚMPLICE DO DEFEITO, e não o usuário. Três coisas juntas:
 *
 * 1. O formulário era UM SÓ, fixo embaixo da lista, servindo criar e editar. O único
 *    sinal de que você estava editando era o texto do botão mudar de "Criar serviço"
 *    para "Salvar serviço" — abaixo de uma caixa de rolagem de 256px de altura, fora
 *    do campo de visão de quem acabou de clicar "Editar" lá em cima.
 * 2. Nada apontava QUAL item estava carregado. Nenhum destaque na linha, nenhum nome
 *    no formulário.
 * 3. E o campo "Código opcional" era, calado, a CHAVE PRIMÁRIA: o id saía de
 *    `slugify(code || name)`. A operação usou o código como código de CATEGORIA —
 *    "CIV" em todo serviço civil — e cada item novo caía no mesmo documento,
 *    renomeando o anterior. Medido: 12 documentos engoliram 83 serviços, um deles em
 *    35 gravações seguidas.
 *
 * O servidor já não sobrescreve mais (`idLivre`, commit aabf142). Isto aqui fecha a
 * outra metade: o modo fica explícito no título, e o item editado é nomeado.
 */

export type EntidadeDeCatalogo = 'macroServices' | 'serviceCatalog' | 'materials';

const NOMES: Record<EntidadeDeCatalogo, string> = {
  macroServices: 'macroserviço',
  serviceCatalog: 'serviço',
  materials: 'material',
};

export function nomeDaEntidade(entidade: EntidadeDeCatalogo): string {
  return NOMES[entidade];
}

export function tituloDoModal(entidade: EntidadeDeCatalogo, editando: string): string {
  const nome = nomeDaEntidade(entidade);
  return editando.trim() ? `Editar ${nome}` : `Novo ${nome}`;
}

/**
 * ⚠️ NA EDIÇÃO, O NOME DO ITEM É O RECADO. É ele que responde "estou mexendo em qual?"
 * — a pergunta que a tela antiga não respondia e que produziu as 83 sobrescritas.
 */
export function descricaoDoModal(entidade: EntidadeDeCatalogo, editando: string): string {
  const nome = editando.trim();
  if (nome) return `Alterando "${nome}". O item continua o mesmo; muda o que está escrito nele.`;
  return `Cria um ${nomeDaEntidade(entidade)} novo. Nenhum item existente é alterado.`;
}

export function rotuloDoBotaoSalvar(entidade: EntidadeDeCatalogo, editando: string): string {
  return editando.trim() ? 'Salvar alterações' : `Criar ${nomeDaEntidade(entidade)}`;
}
