# Coloca o PROCV do Nº do programa nas células VAZIAS da coluna O (PJ) da aba
# MACLM do MACLM.xlsx — pedido do usuário (22/10/2026), a cada 15 min, pra
# linhas novas de Compras já nascerem puxando de "Programas de corte (FC Nexus).xlsx"
# (gerado por app/programas_corte_excel.py no sync de Material de compra).
# - Usa o próprio Excel (COM): vínculos externos, consultas e formatação ficam intactos.
# - Não mexe em célula da O que já tem valor ou fórmula (o que Compras digitou vale).
# - Pula o ciclo se alguém estiver com o MACLM aberto; só salva se escreveu algo.
# Registrado no Agendador como "FCNexus - PROCV coluna O do MACLM" (procv_coluna_o_maclm.bat).
$ErrorActionPreference = "Stop"
$pasta = "J:\6 - PCP\PCP-CP"
$maclm = "$pasta\MACLM.xlsx"
$programas = "$pasta\Programas de corte (FC Nexus).xlsx"
$formulaBase = "=IFERROR(VLOOKUP(N{0},'$pasta\[Programas de corte (FC Nexus).xlsx]Programas'!`$A:`$B,2,FALSE),`"`")"
$agora = Get-Date -Format "dd/MM/yyyy HH:mm:ss"

if (Test-Path -LiteralPath "$pasta\~`$MACLM.xlsx") { "$agora PULADO - MACLM aberto por alguém"; exit 0 }
if (-not (Test-Path -LiteralPath $programas)) { "$agora PULADO - arquivo de programas ainda não existe"; exit 0 }

$x = New-Object -ComObject Excel.Application
$x.Visible = $false
$x.DisplayAlerts = $false
$x.AskToUpdateLinks = $false
$x.EnableEvents = $false
$autoFill = $x.AutoCorrect.AutoFillFormulasInLists
$x.AutoCorrect.AutoFillFormulasInLists = $false
try {
    $wp = $x.Workbooks.Open($programas, 0, $true)
    $wb = $x.Workbooks.Open($maclm, 0, $false)
    if ($wb.ReadOnly) { "$agora PULADO - MACLM abriu só leitura (alguém abriu agora)"; $wb.Close($false); $wp.Close($false); exit 0 }
    $calc = $x.Calculation
    $x.Calculation = -4135  # manual durante a escrita
    $ws = $wb.Worksheets.Item("MACLM")
    $ultima = $ws.Cells($ws.Rows.Count, 14).End(-4162).Row
    $n = $ws.Range("N2:N$ultima").Value2
    $o = $ws.Range("O2:O$ultima").Formula
    $linhas = New-Object System.Collections.Generic.List[int]
    for ($i = 1; $i -le ($ultima - 1); $i++) {
        $ped = $n[$i, 1]
        $atual = $o[$i, 1]
        if ($ped -ne $null -and "$ped".Trim() -ne "" -and ($atual -eq $null -or "$atual" -eq "")) { $linhas.Add($i + 1) }
    }
    if ($linhas.Count -eq 0) {
        $x.Calculation = $calc
        $wb.Close($false); $wp.Close($false)
        "$agora OK - nenhuma célula vazia na coluna O"
        exit 0
    }
    # Blocos contínuos: a fórmula relativa preenche o bloco todo de uma vez.
    $k = 0
    while ($k -lt $linhas.Count) {
        $ini = $linhas[$k]; $fim = $ini
        while ($k + 1 -lt $linhas.Count -and $linhas[$k + 1] -eq $fim + 1) { $k++; $fim = $linhas[$k] }
        $ws.Range("O${ini}:O${fim}").Formula = ($formulaBase -f $ini)
        $k++
    }
    $x.Calculation = $calc
    $x.Calculate()
    $v = $ws.Range("O2:O$ultima").Value2
    $preenchidas = 0
    foreach ($l in $linhas) { $val = $v[($l - 1), 1]; if ($val -ne $null -and "$val" -ne "") { $preenchidas++ } }
    $wb.Save()
    $wb.Close($false)
    $wp.Close($false)
    "$agora OK - PROCV em $($linhas.Count) célula(s) da coluna O; $preenchidas já com programa"
} catch {
    "$agora ERRO - $($_.Exception.Message)"
    exit 1
} finally {
    $x.AutoCorrect.AutoFillFormulasInLists = $autoFill
    $x.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x)
}
