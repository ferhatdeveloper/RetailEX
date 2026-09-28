; RetailEX Portable — yönetici (admin) NSIS kurulum.
; Dosyalar portable-stage'den gelir; kurulum sonrası tüm Windows hizmetlerini kurar.
; Yer tutucular pack script tarafından doldurulur:
;   __VERSION__  __OUTFILE__  __STAGE_DIR__  __ICON__

Unicode true
RequestExecutionLevel admin
SetCompressor /SOLID lzma

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

!insertmacro MUI_LANGUAGE "Turkish"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "RetailEX Portable yalnızca 64-bit Windows destekler."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "RetailEX Portable" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Önceki süreçleri / hizmetleri nazikçe durdur (güncelleme)
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Service /y'
  nsExec::ExecToLog 'cmd /c net stop RetailEX_SQL_Bridge /y'
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Printer /y'
  nsExec::ExecToLog 'cmd /c net stop RetailEX_PostgREST /y'
  Sleep 500

  File /r "__STAGE_DIR__\*.*"

  ; install-services-setup.ps1 Prefix dosyasını okur
  FileOpen $0 "$INSTDIR\retailex_install_prefix.txt" w
  FileWrite $0 "$INSTDIR"
  FileClose $0

  DetailPrint "Windows hizmetleri kuruluyor (Yönetici)..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\install-services-setup.ps1"'
  Pop $0
  DetailPrint "install-services-setup.ps1 exit=$0"
  ${If} $0 = 2
    DetailPrint "Hizmet kurulumu kısmi (exit 2) — Sync OK, Bridge gecikmiş olabilir."
    MessageBox MB_OK|MB_ICONINFORMATION "RetailEX çekirdek senkron hizmeti kuruldu; SQL Bridge kaydı eksik veya gecikti.$\r$\n$\r$\nKurtarma (Yönetici):$\r$\n$INSTDIR\install-services-manual.cmd$\r$\n$\r$\nPostgREST: $INSTDIR\install-postgrest-service.cmd$\r$\nLog: C:\ProgramData\RetailEX\install_services_setup_last.log"
  ${ElseIf} $0 <> 0
    DetailPrint "Hizmet kurulumu başarısız (exit $0)."
    MessageBox MB_OK|MB_ICONEXCLAMATION "RetailEX Windows hizmetleri tam kurulamadı (çıkış $0).$\r$\n$\r$\nDosyalar kuruldu. Yönetici olarak çalıştırın:$\r$\n$INSTDIR\install-services-manual.cmd$\r$\n$\r$\nLog: C:\ProgramData\RetailEX\install_services_setup_last.log"
  ${Else}
    DetailPrint "Hizmetler kuruldu."
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
  CreateShortCut "$SMPROGRAMS\RetailEX\Servisleri Kur (Yönetici).lnk" "$INSTDIR\install-services-manual.cmd"
  CreateShortCut "$DESKTOP\RetailEX.lnk" "$INSTDIR\retailex.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Service /y'
  nsExec::ExecToLog 'cmd /c net stop RetailEX_SQL_Bridge /y'
  nsExec::ExecToLog 'cmd /c net stop RetailEX_Printer /y'
  nsExec::ExecToLog 'cmd /c net stop RetailEX_PostgREST /y'
  Sleep 300

  ; Hizmetleri kaldır (best-effort)
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "foreach ($n in @(\"RetailEX_Service\",\"RetailEX_SQL_Bridge\",\"RetailEX_Printer\",\"RetailEX_PostgREST\")) { $s=Get-Service -Name $n -EA SilentlyContinue; if ($s) { sc.exe delete $n } }"'

  Delete "$DESKTOP\RetailEX.lnk"
  RMDir /r "$SMPROGRAMS\RetailEX"
  DeleteRegKey HKLM "${UNINSTKEY}"

  ; Uygulama dosyalarını sil; config.db / PG verisi C:\RetailEx altında kalır
  RMDir /r "$INSTDIR"
SectionEnd
