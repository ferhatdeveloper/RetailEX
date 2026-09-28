; RetailEX Portable — admin NSIS. Placeholders: __VERSION__ __OUTFILE__ __STAGE_DIR__ __ICON__
; MessageBox metinleri ASCII (NSIS UTF-8 Turkce bozulmasin diye).

Unicode true
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SilentInstall normal
ShowInstDetails show

!include "MUI2.nsh"
!include "x64.nsh"

!define PRODUCT_NAME "RetailEX Portable"
!define PRODUCT_VERSION "__VERSION__"
!define PRODUCT_PUBLISHER "RetailEX"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RetailEXPortable"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "__OUTFILE__"
InstallDir "C:\RetailEx\App"
InstallDirRegKey HKLM "${UNINSTKEY}" "InstallLocation"
ShowInstDetails show

!define MUI_ABORTWARNING
!define MUI_ICON "__ICON__"
!define MUI_UNICON "__ICON__"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ; Log: if UI never appears, check %TEMP%\retailex_portable_setup.log (SAC / silent kill)
  ClearErrors
  FileOpen $R9 "$TEMP\retailex_portable_setup.log" w
  IfErrors skip_log
    FileWrite $R9 "RetailEX Portable setup onInit OK$\r$\n"
    FileWrite $R9 "Version=${PRODUCT_VERSION}$\r$\n"
    FileClose $R9
  skip_log:

  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "RetailEX Portable requires 64-bit Windows."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "RetailEX Portable" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  nsExec::ExecToLog 'cmd /c net stop RetailEX_Service /y'
  Pop $0
  nsExec::ExecToLog 'cmd /c net stop RetailEX_SQL_Bridge /y'
  Pop $0
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Printer /y'
  Pop $0
  nsExec::ExecToLog 'cmd /c net stop RetailEX_PostgREST /y'
  Pop $0
  Sleep 500

  File /r "__STAGE_DIR__\*.*"

  FileOpen $0 "$INSTDIR\retailex_install_prefix.txt" w
  FileWrite $0 "$INSTDIR"
  FileClose $0

  ; Mark of the Web + unblock before service install
  DetailPrint "Unblocking downloaded files..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath ''$INSTDIR'' -Recurse -Include *.exe,*.ps1,*.cmd,*.dll -File -EA SilentlyContinue | ForEach-Object { Unblock-File -LiteralPath $_.FullName -EA SilentlyContinue }"'
  Pop $0

  DetailPrint "Installing Windows services (admin)..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\install-services-setup.ps1"'
  Pop $0
  DetailPrint "install-services-setup.ps1 exit=$0"
  ${If} $0 = 2
    DetailPrint "Partial service install (exit 2)."
    MessageBox MB_OK|MB_ICONINFORMATION "Core sync service OK; SQL Bridge may be delayed.$\r$\n$\r$\nRecovery (Run as Administrator):$\r$\n$INSTDIR\install-services-manual.cmd$\r$\n$\r$\nIf Smart App Control blocked EXEs:$\r$\nWindows Security > App and browser control > Smart App Control = Off$\r$\nthen re-run install-services-manual.cmd$\r$\n$\r$\nLog: C:\ProgramData\RetailEX\install_services_setup_last.log"
  ${ElseIf} $0 <> 0
    DetailPrint "Service install failed (exit $0)."
    MessageBox MB_OK|MB_ICONEXCLAMATION "Windows services not fully installed (exit $0).$\r$\nFiles are on disk.$\r$\n$\r$\n1) If you saw Smart App Control blocked this app:$\r$\n   Windows Security > App and browser control > Smart App Control = Off$\r$\n2) Run as Administrator:$\r$\n   $INSTDIR\install-services-manual.cmd$\r$\n$\r$\nLog: C:\ProgramData\RetailEX\install_services_setup_last.log"
  ${Else}
    DetailPrint "Services installed."
  ${EndIf}

  WriteUninstaller "$INSTDIR\uninstall-portable.exe"

  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "RetailEX Portable ${PRODUCT_VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\retailex.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\uninstall-portable.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1

  CreateDirectory "$SMPROGRAMS\RetailEX"
  CreateShortCut "$SMPROGRAMS\RetailEX\RetailEX.lnk" "$INSTDIR\retailex.exe"
  CreateShortCut "$SMPROGRAMS\RetailEX\RetailEX Config.lnk" "$INSTDIR\RetailEX_Config.exe"
  CreateShortCut "$SMPROGRAMS\RetailEX\RetailEX Tools.lnk" "$INSTDIR\RetailEX_Tools.exe"
  CreateShortCut "$SMPROGRAMS\RetailEX\Install Services (Admin).lnk" "$INSTDIR\install-services-manual.cmd"
  CreateShortCut "$DESKTOP\RetailEX.lnk" "$INSTDIR\retailex.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Service /y'
  Pop $0
  nsExec::ExecToLog 'cmd /c net stop RetailEX_SQL_Bridge /y'
  Pop $0
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Printer /y'
  Pop $0
  nsExec::ExecToLog 'cmd /c net stop RetailEX_PostgREST /y'
  Pop $0
  Sleep 300

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "foreach ($n in @(''RetailEX_Service'',''RetailEX_SQL_Bridge'',''RetailEX_Printer'',''RetailEX_PostgREST'')) { if (Get-Service -Name $n -EA SilentlyContinue) { sc.exe delete $n } }"'
  Pop $0

  Delete "$DESKTOP\RetailEX.lnk"
  RMDir /r "$SMPROGRAMS\RetailEX"
  DeleteRegKey HKLM "${UNINSTKEY}"
  RMDir /r "$INSTDIR"
SectionEnd
