import { useEffect, useState } from 'react';

/**
 * Um relógio que anda de minuto em minuto.
 *
 * ⚠️ `new Date()` DENTRO DE useMemo CONGELA: o memo só recalcula quando a lista muda,
 * e o polling preserva a identidade da lista quando nada mudou. Foi assim que a
 * suspensão que vencia com a tela aberta continuava fora dos números (auditoria de
 * 26/10/2026) — e que a Hoje parava na hora em que foi aberta (devlog 01–07/08).
 * Quem depende do tempo põe `agora` nas dependências do memo.
 */
export function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return agora;
}
