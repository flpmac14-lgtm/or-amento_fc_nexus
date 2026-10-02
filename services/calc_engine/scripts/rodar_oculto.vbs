' Roda um .bat sem abrir a janela preta do console (pedido do usuario).
' Usado pelas tarefas agendadas "FCNexus - ...":
'   wscript.exe "...\scripts\rodar_oculto.vbs" "...\scripts\algum_script.bat"
' Espera o .bat terminar e devolve o codigo de saida dele para o Agendador.
If WScript.Arguments.Count < 1 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
codigo = shell.Run("cmd.exe /c """"" & WScript.Arguments(0) & """""", 0, True)
WScript.Quit codigo
