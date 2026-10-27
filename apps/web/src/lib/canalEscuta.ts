// Canal de Escuta do Colaborador — pedido do usuário (26/10/2026). Relatos
// anônimos do formulário do site (macfab.com.br/canal-de-escuta), gravados por
// app/api/publico/canal-escuta e vistos na tela /canal-escuta (só o flpmac14,
// conferido em app/api/canal-escuta). Tabela: migration 0060.
// As listas são as mesmas do formulário: valor fora delas é descartado.

export const ROTA_CANAL_ESCUTA = "/canal-escuta";

export const SETORES = [
  "Administrativo", "Qualidade", "Serviços Gerais", "Usinagem", "Caldeiraria", "Soldagem",
  "PCP", "Pintura Industrial", "Logística / Expedição", "Almoxarifado", "Outro", "Prefiro não informar",
] as const;
export const ASSUNTOS = [
  "Comunicação", "Organização do trabalho", "Relação entre colegas", "Tratamento inadequado",
  "Relação com liderança", "Conflitos no trabalho", "Sobrecarga / distribuição",
  "Conduta inadequada / assédio", "Reconhecimento", "Outro",
] as const;
export const FREQUENCIAS = ["Foi pontual", "Às vezes", "Com frequência", "Quase sempre"] as const;
export const IMPACTOS = [
  "Ambiente de trabalho", "Relação entre pessoas", "Organização das atividades",
  "Comunicação", "Andamento do trabalho", "Outro",
] as const;
export const STATUS_RELATO = ["Novo", "Em análise", "Concluído", "Arquivado"] as const;
export type StatusRelato = (typeof STATUS_RELATO)[number];

export interface RelatoCanalEscuta {
  numero: number;
  data: string; // AAAA-MM-DD
  setor: string | null;
  assuntos: string[];
  frequencia: string | null;
  impactos: string[];
  relato: string;
  onde: string | null;
  sugestao: string | null;
  status: StatusRelato;
  observacoes_rh: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

/** "Outro: barulho" conta como "Outro" nos totais do relatório. */
export function semDetalheOutro(v: string): string {
  return v.startsWith("Outro:") ? "Outro" : v;
}
