"""Backup diário do banco do app (Supabase) — pedido explícito do usuário:
"gerar um backup todo dia no horário do almoço, umas 12:20".

Exporta TODAS as tabelas do schema public (orçamentos, Follow up com fotos,
registros, Croqui de corte, espelhos das planilhas...) em CSV, uma por
arquivo, dentro de um .zip com data e hora:
    <PASTA>\\backup_fcnexus_AAAA-MM-DD_HHMM.zip
e apaga os backups com mais de DIAS_GUARDAR dias.

Registrado no Agendador de Tarefas como "FCNexus - Backup diario do banco"
(todo dia 12:20, via backup_banco.bat). A pasta padrão fica no OneDrive, que
sobe sozinho pra nuvem — assim existe cópia fora deste computador.

Contas de login (schema auth do Supabase) NÃO entram: guardam senhas
(criptografadas) e são recriáveis pela tela de orçamentistas.

Restaurar uma tabela (ex.: croqui_corte_itens) a partir do .zip:
    python scripts/backup_banco.py --restaurar <arquivo.zip> <tabela>
(apaga o conteúdo atual da tabela e carrega o do backup — pede confirmação).

Uso manual: python scripts/backup_banco.py
"""

import io
import os
import sys
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

from app.orcamentos_salvos import _conectar  # noqa: E402

PASTA = Path(os.environ.get("BACKUP_PASTA", r"C:\Users\gerencia\OneDrive\Backups FC Nexus"))
DIAS_GUARDAR = int(os.environ.get("BACKUP_DIAS", "30"))


def fazer_backup() -> Path:
    PASTA.mkdir(parents=True, exist_ok=True)
    agora = datetime.now()
    destino = PASTA / f"backup_fcnexus_{agora:%Y-%m-%d_%H%M}.zip"
    temporario = destino.with_suffix(".parcial")
    resumo = []
    with _conectar() as conn, conn.cursor() as cur, zipfile.ZipFile(temporario, "w", zipfile.ZIP_DEFLATED) as z:
        # Leitura consistente: todas as tabelas no mesmo instante.
        cur.execute("begin isolation level repeatable read read only")
        cur.execute("select tablename from pg_tables where schemaname = 'public' order by tablename")
        tabelas = [r[0] for r in cur.fetchall()]
        for tabela in tabelas:
            buffer = io.BytesIO()
            with cur.copy(f'copy public."{tabela}" to stdout with (format csv, header true)') as copia:
                for bloco in copia:
                    buffer.write(bloco)
            z.writestr(f"{tabela}.csv", buffer.getvalue())
            cur.execute(f'select count(*) from public."{tabela}"')
            resumo.append(f"{tabela}: {cur.fetchone()[0]} linhas")
        cur.execute("rollback")
        z.writestr(
            "LEIA-ME.txt",
            f"Backup do banco do FC Nexus — {agora:%d/%m/%Y %H:%M}\n"
            "Uma tabela por arquivo CSV (schema public). Estrutura das tabelas: supabase/migrations no repositório.\n"
            "Restaurar: python scripts/backup_banco.py --restaurar <este.zip> <tabela>\n\n" + "\n".join(resumo) + "\n",
        )
    temporario.replace(destino)
    return destino


def limpar_antigos() -> int:
    limite = datetime.now() - timedelta(days=DIAS_GUARDAR)
    apagados = 0
    for arq in PASTA.glob("backup_fcnexus_*.zip"):
        if datetime.fromtimestamp(arq.stat().st_mtime) < limite:
            arq.unlink()
            apagados += 1
    return apagados


def restaurar(arquivo: str, tabela: str) -> None:
    with zipfile.ZipFile(arquivo) as z:
        dados = z.read(f"{tabela}.csv")
    resposta = input(f"Isso APAGA o conteúdo atual de '{tabela}' e carrega o do backup {arquivo}. Digite SIM para continuar: ")
    if resposta.strip() != "SIM":
        print("Cancelado.")
        return
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(f'delete from public."{tabela}"')
        with cur.copy(f'copy public."{tabela}" from stdin with (format csv, header true)') as copia:
            copia.write(dados)
        conn.commit()
    print(f"'{tabela}' restaurada de {arquivo}.")


def main() -> int:
    if "--restaurar" in sys.argv:
        i = sys.argv.index("--restaurar")
        restaurar(sys.argv[i + 1], sys.argv[i + 2])
        return 0
    agora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    try:
        destino = fazer_backup()
        apagados = limpar_antigos()
        print(f"{agora} OK - {destino.name} ({destino.stat().st_size / 1e6:.1f} MB)"
              + (f", {apagados} backup(s) antigo(s) apagado(s)" if apagados else ""))
        return 0
    except Exception as e:  # noqa: BLE001
        print(f"{agora} ERRO - {type(e).__name__}: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
