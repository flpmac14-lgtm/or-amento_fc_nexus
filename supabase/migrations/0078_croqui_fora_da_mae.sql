-- Croqui de corte — linha órfã (pedido do usuário, 19/11/2026): quando o
-- PO+IT+POS muda na MACLM (ex.: POS digitada 001 e corrigida pra 007), a
-- propagação criava a chave nova e a antiga ficava na Croqui pra sempre
-- (4505189098-070.001 × 070.007). Agora a propagação apaga a antiga se ninguém
-- apontou nada nela; se já tem apontamento, fica marcada aqui e aparece com
-- aviso "não está mais no Material de compra".
alter table croqui_corte_itens add column if not exists fora_da_mae boolean not null default false;
