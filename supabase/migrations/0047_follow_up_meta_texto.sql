-- Follow up — pedido do usuário (15/10/2026): a META da Controle de obras tem
-- texto também ("3P", "CANCELADO …", "17/08 - DUAS FOLHAS…") e datas digitadas
-- como texto ("04/01/24"). Vira texto: traz tudo como está na planilha.
alter table follow_up_itens alter column meta type text using to_char(meta, 'DD/MM/YYYY');
