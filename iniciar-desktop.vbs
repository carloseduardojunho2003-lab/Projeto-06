Option Explicit

Dim shell, fso, projectDir, npmPath, command, appName, desktopEntry, electronPackage, packagedExe, desktopShortcutPath, iconPath

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
npmPath = "C:\Program Files\nodejs\npm.cmd"
appName = "Privado"
desktopEntry = fso.BuildPath(projectDir, "desktop\main.js")
electronPackage = fso.BuildPath(projectDir, "node_modules\electron\package.json")
packagedExe = fso.BuildPath(projectDir, "dist_build\Privado-win32-x64\Privado.exe")
desktopShortcutPath = shell.SpecialFolders("Desktop") & "\Privado.lnk"
iconPath = fso.BuildPath(projectDir, "desktop\assets\app-icon.ico")

Sub CreateOrUpdateShortcut(targetPath, workingDirectory, arguments)
  Dim shortcut, shortcutIcon
  Set shortcut = shell.CreateShortcut(desktopShortcutPath)
  shortcut.TargetPath = targetPath
  shortcut.WorkingDirectory = workingDirectory
  shortcut.Arguments = arguments
  shortcut.WindowStyle = 1
  shortcut.Description = appName
  shortcutIcon = ""
  If LCase(fso.GetExtensionName(targetPath)) = "exe" And fso.FileExists(targetPath) Then
    shortcutIcon = targetPath & ",0"
  ElseIf fso.FileExists(iconPath) Then
    shortcutIcon = iconPath & ",0"
  End If

  If Len(shortcutIcon) > 0 Then
    shortcut.IconLocation = shortcutIcon
  End If
  shortcut.Save
End Sub

Sub KillDevElectron()
  shell.Run "cmd.exe /c taskkill /IM electron.exe /F >nul 2>nul", 0, True
End Sub

If fso.FileExists(packagedExe) Then
  KillDevElectron
  CreateOrUpdateShortcut packagedExe, fso.GetParentFolderName(packagedExe), ""
  shell.Run """" & packagedExe & """", 1, False
  WScript.Quit 0
End If

If Not fso.FileExists(npmPath) Then
  MsgBox "npm.cmd nao foi encontrado em: " & npmPath, vbCritical, appName
  WScript.Quit 1
End If

If Not fso.FileExists(fso.BuildPath(projectDir, "package.json")) Then
  MsgBox "package.json nao foi encontrado em: " & projectDir, vbCritical, appName
  WScript.Quit 1
End If

If Not fso.FileExists(desktopEntry) Then
  MsgBox "desktop\\main.js nao foi encontrado em: " & desktopEntry, vbCritical, appName
  WScript.Quit 1
End If

If Not fso.FileExists(electronPackage) Then
  MsgBox "Dependencias do desktop nao foram encontradas. Execute npm install em: " & projectDir, vbCritical, appName
  WScript.Quit 1
End If

command = "cmd.exe /c cd /d """ & projectDir & """ && """ & npmPath & """ run desktop:start"
CreateOrUpdateShortcut "C:\Windows\System32\cmd.exe", projectDir, "/c cd /d """ & projectDir & """ && """ & npmPath & """ run desktop:start"
shell.Run command, 0, False