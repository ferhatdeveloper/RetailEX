Unicode true
SetCompressor lzma

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "StrFunc.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"

; Modern UI Themes & Branding
!define MUI_BGCOLOR "F0F0F0"
!define MUI_TEXTCOLOR "333333"
!define MUI_FONT "Segoe UI"
!define MUI_FONTSIZE "9"



${StrCase}
${StrLoc}

!ifndef MANUFACTURER
  !define MANUFACTURER "retailex"
!endif
!ifndef PRODUCTNAME
  !define PRODUCTNAME "RetailEX"
!endif
!ifndef VERSION
  !define VERSION "0.1.19"
!endif
!ifndef VERSIONWITHBUILD
  !define VERSIONWITHBUILD "0.1.19.0"
!endif
!ifndef INSTALLMODE
  !define INSTALLMODE "currentUser"
!endif
!ifndef LICENSE
  !define LICENSE ""
!endif
!ifndef INSTALLERICON
  !define INSTALLERICON "D:\RetailEX\src-tauri\icons\icon.ico"
!endif
!ifndef SIDEBARIMAGE
  !define SIDEBARIMAGE "D:\RetailEX\src-tauri\branding\sidebar.bmp"
!endif
!ifndef HEADERIMAGE
  !define HEADERIMAGE "D:\RetailEX\src-tauri\branding\header.bmp"
!endif
!ifndef MAINBINARYNAME
  !define MAINBINARYNAME "RetailEX"
!endif
!ifndef MAINBINARYSRCPATH
  !define MAINBINARYSRCPATH "D:\RetailEX\src-tauri\target\release\retailex.exe"
!endif
!ifndef BUNDLEID
  !define BUNDLEID "com.retailex.app"
!endif
!ifndef COPYRIGHT
  !define COPYRIGHT ""
!endif
!ifndef OUTFILE
  !define OUTFILE "nsis-output.exe"
!endif
!ifndef ARCH
  !define ARCH "x64"
!endif
!define PLUGINSPATH ""
!define ALLOWDOWNGRADES "true"
!define DISPLAYLANGUAGESELECTOR "false"
!define INSTALLWEBVIEW2MODE "downloadBootstrapper"
!define WEBVIEW2INSTALLERARGS "/silent"
!define WEBVIEW2BOOTSTRAPPERPATH ""
!define WEBVIEW2INSTALLERPATH ""
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUPRODUCTKEY "Software\${MANUFACTURER}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND ""
!define ESTIMATEDSIZE "0x004318"

Var WSUrl
Var AMQPUrl
Var InstallRole ; 0 for Terminal, 1 for Server
Var LogoObjUser
Var LogoObjPass
Var LogoObjPath
Var UseLogoObj
Var UseFixedVpnIp
Var WSUrl_Obj
Var AMQPUrl_Obj
Var RoleTerminal_Obj
Var RoleServer_Obj
Var LogoObjUser_Obj
Var LogoObjPass_Obj
Var LogoObjPath_Obj
Var UseLogoObj_Obj
Var UseFixedVpnIp_Obj

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

; Plugins path, currently exists for linux only
!if "${PLUGINSPATH}" != ""
    !addplugindir "${PLUGINSPATH}"
    !addplugindir "${PLUGINSPATH}\x86-unicode"
    !addplugindir "${PLUGINSPATH}\x86-unicode\additional"
    !addplugindir "Plugins\x86-unicode"
    !addplugindir "Plugins\x86-unicode\additional"
!endif

!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel highest
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP  "${HEADERIMAGE}"
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Branding Colors
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_INSTFILESPAGE_COLORS "333333 FFFFFF" 
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

; Installer pages, must be ordered as they appear
; 1. Welcome Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_WELCOME

; 2. License Page (if defined)
!if "${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!endif

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif


; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installtion was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall

; Custom Pages
Page custom PageRoleSelection PageLeaveRoleSelection
Page custom PageSettings PageLeaveSettings
Page custom PageLogoObjects PageLeaveLogoObjects
Function PageReinstall
  ; ... (Wix check remains same) ...
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_done 
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_done
    StrCpy $R7 "wix"
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
    Goto compare_version
  wix_done:

  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  compare_version:
  StrCpy $R4 "older"
  ${If} $R7 == "wix"
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "unknown" ${|}

  ; nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  StrCpy $R0 1 ; Assume new version for now
  
  ; Turkish Language Handling for Update/Reinstall
  ${If} $R0 == 0
    StrCpy $R1 "RetailEX zaten kurulu. Ne yapmak istersiniz?"
    StrCpy $R2 "Mevcut kurulumu güncelle/onar"
    StrCpy $R3 "Kaldır ve yeniden kur"
    !insertmacro MUI_HEADER_TEXT "Zaten Kurulu" "Bakım modunu seçin."
    StrCpy $R5 "2"
  ${ElseIf} $R0 == 1
    StrCpy $R1 "Eski bir RetailEX sürümü bulundu ($R0). Güncelleme mevcut."
    StrCpy $R2 "Sistemi şimdi güncelle (Önerilen)"
    StrCpy $R3 "Kaldır ve sıfırdan kur"
    !insertmacro MUI_HEADER_TEXT "Güncelleme Mevcut" "Nasıl devam etmek istersiniz?"
    StrCpy $R5 "1"
  ${ElseIf} $R0 == -1
    StrCpy $R1 "Daha yeni bir RetailEX sürümü zaten kurulu."
    StrCpy $R2 "Düşük sürüme güncelle (Eski veriler korunur)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "Kaldırma yapmadan devam et"
    !else
      StrCpy $R3 "Devam etmek için önce mevcut sürümü kaldırın"
    !endif
    !insertmacro MUI_HEADER_TEXT "Sürüm Düşürme" "Nasıl devam etmek istersiniz?"
    StrCpy $R5 "1"
  ${Else}
    Abort
  ${EndIf}

  Call SkipIfPassive
  nsDialogs::Create 1018
  Pop $R4
  ${NSD_CreateLabel} 0 0 100% 24u $R1
  Pop $R1
  ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
  Pop $R2
  ${NSD_OnClick} $R2 PageReinstallUpdateSelection
  ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
  Pop $R3
  SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
  nsDialogs::Show
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ; $R5 holds whether we are reinstalling the same version or not
  ; $R5 == "1" -> different versions
  ; $R5 == "2" -> same version
  ;
  ; $R1 holds the radio buttons state. its meaning is dependant on the context
  StrCmp $R5 "1" 0 +2 ; Existing install is not the same version?
    StrCmp $R1 "1" reinst_uninstall reinst_done ; $R1 == "1", then user chose to uninstall existing version, otherwise skip uninstalling
  StrCmp $R1 "1" reinst_done ; Same version? skip uninstalling

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $R7 == "wix"
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ExecWait '$R1 /P _?=$4' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ${If} $0 = 1 ; User aborted uninstaller?
        StrCmp $R5 "2" 0 +2 ; Is the existing install the same version?
          Quit ; ...yes, already installed, we are done
        Abort
      ${EndIf}
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${Else}
      StrCpy $0 $R1 1
      ${IfThen} $0 == '"' ${|} StrCpy $R1 $R1 -1 1 ${|} ; Strip quotes from UninstallString
      Delete $R1
      RMDir $INSTDIR
    ${EndIf}
  reinst_done:
FunctionEnd



Function PageSettings
  Call SkipIfPassive
  !insertmacro MUI_HEADER_TEXT "Gelişmiş Yapılandırma" "Merkezi sunucu ve kuyruk sistemi bağlantı ayarları."
  nsDialogs::Create 1018
  Pop $0
  
  CreateFont $1 "${MUI_FONT}" 9 700
  
  ${NSD_CreateLabel} 0 0 100% 10u "WebSocket Sunucu Adresi:"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $1 1
  ${NSD_CreateText} 0 12u 100% 14u "ws://0.0.0.0:8000/api/v1/ws"
  Pop $WSUrl_Obj
  
  ${NSD_CreateLabel} 0 40u 100% 10u "RabbitMQ (AMQP) Adresi:"
  Pop $2
  SendMessage $2 ${WM_SETFONT} $1 1
  ${NSD_CreateText} 0 52u 100% 14u "amqp://guest:guest@91.205.41.130:5672"
  Pop $AMQPUrl_Obj
  
  ${NSD_CreateLabel} 0 80u 100% 10u "Bağlantı Ayarları:"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $1 1
  
  ${NSD_CreateCheckBox} 0 92u 100% 12u "Sanal VPN IP Kullan (Önerilen: 10.02.93.1)"
  Pop $UseFixedVpnIp_Obj
  ${If} $UseFixedVpnIp == 1
    SendMessage $UseFixedVpnIp_Obj ${BM_SETCHECK} ${BST_CHECKED} 0
  ${EndIf}
  
  ; Helper function to toggle fields
  GetFunctionAddress $0 OnVpnIpCheckboxClick
  nsDialogs::OnClick $UseFixedVpnIp_Obj $0
  
  ; Set initial state
  Call OnVpnIpCheckboxClick

  ${NSD_CreateLabel} 0 110u 100% 20u "Not: Master Sunucu kuruyorsanız bu adresler otomatik olarak yapılandırılacaktır."
  Pop $0
  
  nsDialogs::Show
FunctionEnd

Function OnVpnIpCheckboxClick
  ${NSD_GetState} $UseFixedVpnIp_Obj $0
  ${If} $0 == ${BST_CHECKED}
    SendMessage $WSUrl_Obj ${WM_SETTEXT} 0 "STR:ws://10.02.93.1:8000/api/v1/ws"
    SendMessage $AMQPUrl_Obj ${WM_SETTEXT} 0 "STR:amqp://guest:guest@10.02.93.1:5672"
    EnableWindow $WSUrl_Obj 0
    EnableWindow $AMQPUrl_Obj 0
  ${Else}
    EnableWindow $WSUrl_Obj 1
    EnableWindow $AMQPUrl_Obj 1
  ${EndIf}
FunctionEnd

Function PageLeaveSettings
  ${NSD_GetText} $WSUrl_Obj $WSUrl
  ${NSD_GetText} $AMQPUrl_Obj $AMQPUrl
  ${NSD_GetState} $UseFixedVpnIp_Obj $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UseFixedVpnIp 1
  ${Else}
    StrCpy $UseFixedVpnIp 0
  ${EndIf}
FunctionEnd

Function PageLogoObjects
  Call SkipIfPassive
  ; Only show for Server role
  ${If} $InstallRole != 1
    Abort
  ${EndIf}
  
  !insertmacro MUI_HEADER_TEXT "Logo Objects Yapılandırması" "Arka plan aktarımları için Logo Objects bilgilerini girin."
  nsDialogs::Create 1018
  Pop $0
  
  CreateFont $1 "${MUI_FONT}" 9 700
  
  ${NSD_CreateLabel} 0 0 100% 10u "Logo Objects (LObjects.dll) Kullanımı:"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $1 1
  
  ${NSD_CreateCheckBox} 0 12u 100% 12u "Logo Objects Aktarımını Etkinleştir"
  Pop $UseLogoObj_Obj
  ${If} $UseLogoObj == 1
    SendMessage $UseLogoObj_Obj ${BM_SETCHECK} ${BST_CHECKED} 0
  ${EndIf}

  ${NSD_CreateLabel} 0 30u 100% 10u "Logo Kullanıcı Adı:"
  Pop $0
  ${NSD_CreateText} 0 40u 100% 12u "$LogoObjUser"
  Pop $LogoObjUser_Obj

  ${NSD_CreateLabel} 0 55u 100% 10u "Logo Şifre:"
  Pop $0
  ${NSD_CreatePassword} 0 65u 100% 12u "$LogoObjPass"
  Pop $LogoObjPass_Obj

  ${NSD_CreateLabel} 0 80u 100% 10u "LObjects.dll Yolu (Örn: C:\LOGO\LObjects.dll):"
  Pop $0
  ; Use dialog units (u) for reliable layout
  ${NSD_CreateText} 0 90u 240u 14u "$LogoObjPath"
  Pop $LogoObjPath_Obj

  ; Create Browse Button
  ${NSD_CreateButton} 245u 90u 55u 14u "Göz At"
  Pop $0
  ${NSD_OnClick} $0 OnBrowseLObjects

  nsDialogs::Show
FunctionEnd

Function OnBrowseLObjects
  nsDialogs::SelectFileDialog open "$LogoObjPath" "DLL Dosyaları|*.dll|Tüm Dosyalar|*.*"
  Pop $0
  ${If} $0 != ""
    StrCpy $LogoObjPath $0
    SendMessage $LogoObjPath_Obj ${WM_SETTEXT} 0 "STR:$LogoObjPath"
  ${EndIf}
FunctionEnd

Function PageLeaveLogoObjects
  ${NSD_GetState} $UseLogoObj_Obj $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UseLogoObj 1
  ${Else}
    StrCpy $UseLogoObj 0
  ${EndIf}
  
  ${NSD_GetText} $LogoObjUser_Obj $LogoObjUser
  ${NSD_GetText} $LogoObjPass_Obj $LogoObjPass
  ${NSD_GetText} $LogoObjPath_Obj $LogoObjPath
FunctionEnd

Function PageRoleSelection
  Call SkipIfPassive
  !insertmacro MUI_HEADER_TEXT "Kurulum Rolü Seçimi" "Bu makinenin sistemdeki görevini belirleyin."
  nsDialogs::Create 1018
  Pop $0
  
  CreateFont $1 "${MUI_FONT}" 10 700
  CreateFont $2 "${MUI_FONT}" 9 400
  
  ${NSD_CreateRadioButton} 0 0 100% 15u "Terminal (Kasa) - Sadece yerel satış ve veri girişi yapar."
  Pop $RoleTerminal_Obj
  SendMessage $RoleTerminal_Obj ${WM_SETFONT} $1 1
  
  ${NSD_CreateLabel} 18u 16u 100% 12u "Kasa bilgisayarları için bu seçeneği kullanın."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $2 1
  
  ${NSD_CreateRadioButton} 0 40u 100% 15u "Merkezi Sunucu (Master Server) - Verileri yönetir."
  Pop $RoleServer_Obj
  SendMessage $RoleServer_Obj ${WM_SETFONT} $1 1
  
  ${NSD_CreateLabel} 18u 56u 100% 12u "RabbitMQ, Redis ve Erlang bu makineye kurulacaktır."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $2 1
  
  ; Default logic: previous role or Terminal
  ${If} $InstallRole == 1
    SendMessage $RoleServer_Obj ${BM_SETCHECK} ${BST_CHECKED} 0
  ${Else}
    SendMessage $RoleTerminal_Obj ${BM_SETCHECK} ${BST_CHECKED} 0
  ${EndIf}
  
  nsDialogs::Show
FunctionEnd

Function PageLeaveRoleSelection
  ${NSD_GetState} $RoleServer_Obj $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallRole 1
    ; Default server settings for master
    StrCpy $WSUrl "ws://localhost:8000/api/v1/ws"
    StrCpy $AMQPUrl "amqp://guest:guest@localhost:5672"
  ${Else}
    StrCpy $InstallRole 0
  ${EndIf}
FunctionEnd

; 5. Choose install directoy page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_DIRECTORY

; 6. Start menu shortcut page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
Var AppStartMenuFolder
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 7. Installation page
!insertmacro MUI_PAGE_INSTFILES

; 8. Finish page
;
; Don't auto jump to finish page after installation page,
; because the installation page has useful info that can be used debug any issues with the installer.
!define MUI_FINISHPAGE_NOAUTOCLOSE
; Use show readme button in the finish page as a button create a desktop shortcut
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(createDesktop)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
; Show run app after installation.
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH

Function RunMainBinary
  ; nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  Exec "$INSTDIR\${MAINBINARYNAME}.exe"
FunctionEnd

; Uninstaller Pages
; 1. Confirm uninstall page
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
!define /ifndef WS_EX_LAYOUTRTL         0x00400000
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow
Function un.ConfirmShow
    FindWindow $1 "#32770" "" $HWNDPARENT ; Find inner dialog
    ${If} $(^RTL) == 1
      System::Call 'USER32::CreateWindowEx(i${__NSD_CheckBox_EXSTYLE}|${WS_EX_LAYOUTRTL},t"${__NSD_CheckBox_CLASS}",t "$(deleteAppData)",i${__NSD_CheckBox_STYLE},i 50,i 100,i 400, i 25,i$1,i0,i0,i0)i.s'
    ${Else}
      System::Call 'USER32::CreateWindowEx(i${__NSD_CheckBox_EXSTYLE},t"${__NSD_CheckBox_CLASS}",t "$(deleteAppData)",i${__NSD_CheckBox_STYLE},i 0,i 100,i 400, i 25,i$1,i0,i0,i0)i.s'
    ${EndIf}
    Pop $DeleteAppDataCheckbox
    SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
    SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave
Function un.ConfirmLeave
    SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

;Languages
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_RESERVEFILE_LANGDLL
  !include "English.nsh"

!macro SetContext
  !if "${INSTALLMODE}" == "currentUser"
    SetShellVarContext current
  !else if "${INSTALLMODE}" == "perMachine"
    SetShellVarContext all
  !endif

  ${If} ${RunningX64}
    !if "${ARCH}" == "x64"
      SetRegView 64
    !else if "${ARCH}" == "arm64"
      SetRegView 64
    !else
      SetRegView 32
    !endif
  ${EndIf}
!macroend

Var PassiveMode
Function .onInit
  ; 1. Check Registry (64-bit view)
  SetRegView 64
  EnumRegKey $1 HKLM "SOFTWARE\PostgreSQL\Installations" 0
  SetRegView 32 ; reset
  
  ${If} $1 == ""
    ; 2. Check Registry (32-bit view - fallback)
    EnumRegKey $1 HKLM "SOFTWARE\PostgreSQL\Installations" 0
  ${EndIf}

  ${If} $1 == ""
    ; 3. Check for PostgreSQL service via PowerShell (final fallback)
    DetailPrint "Checking for PostgreSQL service..."
    ExecWait 'powershell -Command "Get-Service | Where-Object { $_.Name -like \"*postgres*\" }"' $0
    ${If} $0 == 0
      StrCpy $1 "FoundService"
    ${EndIf}
  ${EndIf}

  ${If} $1 == ""
    ; First check if installer is alongside dependency file
    IfFileExists "$EXEDIR\postgresql-15-setup.exe" foundlocalpostgresql
    
    MessageBox MB_YESNO|MB_ICONQUESTION "PostgreSQL gereklidir ancak sistemde bulunamadı.$\n$\nŞimdi PostgreSQL 15 indirilsin ve kurulsun mu?" IDYES installpostgresql IDNO skipinstallpostgresql
    
    foundlocalpostgresql:
      DetailPrint "Yerel PostgreSQL 15 dosyası bulundu, kuruluyor..."
      ExecWait '"$EXEDIR\postgresql-15-setup.exe" --mode unattended --superpassword Yq7xwQpt6c --servicepassword Yq7xwQpt6c'
      Goto skipinstallpostgresql

    installpostgresql:
      DetailPrint "PostgreSQL 15 indiriliyor..."
      ExecWait 'powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri https://get.enterprisedb.com/postgresql/postgresql-15.6-1-windows-x64.exe -OutFile $TEMP\postgresql-15.exe }"' $0

      IfFileExists "$TEMP\postgresql-15.exe" download_success download_fail

      download_success:
        DetailPrint "PostgreSQL 15 kuruluyor..."
        ExecWait '"$TEMP\postgresql-15.exe" --mode unattended --superpassword Yq7xwQpt6c --servicepassword Yq7xwQpt6c'
        Delete "$TEMP\postgresql-15.exe"
        Goto skipinstallpostgresql

      download_fail:
        MessageBox MB_OK|MB_ICONSTOP "İndirme başarısız.$\nLütfen PostgreSQL'i manuel olarak kurun."
        Abort
      
    skipinstallpostgresql:
  ${EndIf}

  ; Default Settings (for silent install)
  StrCpy $WSUrl "ws://0.0.0.0:8000/api/v1/ws"
  StrCpy $AMQPUrl "amqp://guest:guest@91.205.41.130:5672"
  StrCpy $InstallRole 0
  StrCpy $LogoObjUser "LOGO"
  StrCpy $LogoObjPass ""
  StrCpy $LogoObjPath "C:\LOGO\LObjects.dll"
  StrCpy $UseLogoObj 0
  StrCpy $UseFixedVpnIp 1

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  IfErrors +2 0
    StrCpy $PassiveMode 1

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == ""
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif
FunctionEnd


Section EarlyChecks
  ; Abort silent installer if downgrades is disabled
  !if "${ALLOWDOWNGRADES}" == "false"
  IfSilent 0 silent_downgrades_done
    ; If downgrading
    ${If} $R0 == -1
      System::Call 'kernel32::AttachConsole(i -1)i.r0'
      ${If} $0 != 0
        System::Call 'kernel32::GetStdHandle(i -11)i.r0'
        System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
        FileWrite $0 "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  silent_downgrades_done:
  !endif

SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ReadRegStr $5 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"

  StrCmp $4 "" 0 webview2_done
  StrCmp $5 "" 0 webview2_done

  ; Webview2 install modes
  !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
    IfFileExists "$EXEDIR\webview2-offline.exe" 0 +4
      DetailPrint "Yerel WebView2 dosyası bulundu, kullanılıyor..."
      StrCpy $6 "$EXEDIR\webview2-offline.exe"
      Goto install_webview2

    Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    DetailPrint "$(webview2Downloading)"
    ; File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "D:\RetailEX\src-tauri\dependencies\webview2-offline.exe"
    ; We removed the hardcoded embedding to keep installer light. 
    ; If not found locally, download it.
    ExecWait 'powershell -Command "Invoke-WebRequest -Uri https://go.microsoft.com/fwlink/p/?LinkId=2124703 -OutFile $TEMP\MicrosoftEdgeWebview2Setup.exe"' $0
    DetailPrint "$(webview2DownloadSuccess)"
    StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Goto install_webview2
  !endif

  !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
    Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
    DetailPrint "$(installingWebview2)"
    StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
    Goto install_webview2
  !endif

  !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
    Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
    File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
    DetailPrint "$(installingWebview2)"
    StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
    Goto install_webview2
  !endif

  Goto webview2_done

  install_webview2:
    DetailPrint "$(installingWebview2)"
    ; $6 holds the path to the webview2 installer
    ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
    ${If} $1 == 0
      DetailPrint "$(webview2InstallSuccess)"
    ${Else}
      DetailPrint "$(webview2InstallError)"
      Abort "$(webview2AbortError)"
    ${EndIf}
  webview2_done:
SectionEnd

!macro CheckIfAppIsRunning
  StrCpy $R0 1 ; Assume not running
  ${If} $R0 = 0
      IfSilent kill 0
      ${IfThen} $PassiveMode != 1 ${|} MessageBox MB_OKCANCEL "$(appRunningOkKill)" IDOK kill IDCANCEL cancel ${|}
      kill:
        StrCpy $R0 0 ; Assume success
        Sleep 500
        ${If} $R0 = 0
          Goto app_check_done
        ${Else}
          IfSilent silent ui
          silent:
            System::Call 'kernel32::AttachConsole(i -1)i.r0'
            ${If} $0 != 0
              System::Call 'kernel32::GetStdHandle(i -11)i.r0'
              System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
              FileWrite $0 "$(appRunning)$\n"
            ${EndIf}
            Abort
          ui:
            Abort "$(failedToKillApp)"
        ${EndIf}
      cancel:
        Abort "$(appRunning)"
  ${EndIf}
  app_check_done:
!macroend

Section Install
  SetOutPath $INSTDIR

  !insertmacro CheckIfAppIsRunning

   ; Copy main executable
   File "${MAINBINARYSRCPATH}"
   File "D:\RetailEX\src-tauri\wintun.dll"

   ; Copy resources
    CreateDirectory "$INSTDIR\_up_\database\init"
    CreateDirectory "$INSTDIR\_up_\database\sys"
    CreateDirectory "$INSTDIR\_up_\database\migrations"
    File /a "/oname=_up_\database\init\04_demo.sql" "D:\RetailEX\database\init\04_demo.sql"
    File /a "/oname=_up_\database\migrations\001_foundation.sql" "D:\RetailEX\database\migrations\001_foundation.sql"
    File /a "/oname=_up_\database\migrations\002_core_logic.sql" "D:\RetailEX\database\migrations\002_core_logic.sql"
    File /a "/oname=_up_\database\migrations\003_vertical_and_enterprise.sql" "D:\RetailEX\database\migrations\003_vertical_and_enterprise.sql"
    File /a "/oname=_up_\database\migrations\004_seed_data.sql" "D:\RetailEX\database\migrations\004_seed_data.sql"
    File /a "/oname=_up_\database\sys\.keep" "D:\RetailEX\database\sys\.keep"

  ; dependency installation logic moved here
  ${If} $InstallRole == 1
    ; 1. Redis Installation (offline)
    DetailPrint "Checking Redis..."
    ExecWait 'powershell -Command "Get-Service -Name redis -ErrorAction SilentlyContinue"' $0
    ${If} $0 != 0
      DetailPrint "Checking for local Redis installation file..."
      IfFileExists "$EXEDIR\redis-setup.msi" 0 redis_local_missing
        DetailPrint "Installing Redis from local file..."
        ExecWait 'msiexec.exe /i "$EXEDIR\redis-setup.msi" /quiet'
        Goto redis_done
      redis_local_missing:
        DetailPrint "Redis installer not found in $EXEDIR. Skipping offline install."
      redis_done:
    ${EndIf}

    ; 2. Erlang (RabbitMQ dependency, offline)
    DetailPrint "Checking Erlang..."
    ReadRegStr $0 HKLM "SOFTWARE\Ericsson\Erlang\ErlSrv" ""
    ${If} $0 == ""
      DetailPrint "Checking for local Erlang installation file..."
      IfFileExists "$EXEDIR\erlang-setup.exe" 0 erlang_local_missing
        DetailPrint "Installing Erlang from local file..."
        ExecWait '"$EXEDIR\erlang-setup.exe" /S'
        Goto erlang_done
      erlang_local_missing:
        DetailPrint "Erlang installer not found in $EXEDIR. Skipping offline install."
      erlang_done:
    ${EndIf}

    ; 3. RabbitMQ (offline)
    DetailPrint "Checking RabbitMQ..."
    ExecWait 'powershell -Command "Get-Service -Name RabbitMQ -ErrorAction SilentlyContinue"' $0
    ${If} $0 != 0
      DetailPrint "Checking for local RabbitMQ installation file..."
      IfFileExists "$EXEDIR\rabbitmq-setup.exe" 0 rabbitmq_local_missing
        DetailPrint "Installing RabbitMQ from local file..."
        ExecWait '"$EXEDIR\rabbitmq-setup.exe" /S'
        Goto rabbitmq_done
      rabbitmq_local_missing:
        DetailPrint "RabbitMQ installer not found in $EXEDIR. Skipping offline install."
      rabbitmq_done:
    ${EndIf}
  ${EndIf}

  ; Copy external binaries
    File /a "/oname=RetailEX_Service.exe" "D:\RetailEX\src-tauri\target\release\RetailEX_Service.exe"
    File /a "/oname=RetailEX_VPN.exe" "D:\RetailEX\src-tauri\target\release\RetailEX_VPN.exe"
    
    


  ; Install and Start Services
  DetailPrint "Installing Background Services..."
  ExecWait '"$INSTDIR\RetailEX_Service.exe" --install'
  ExecWait '"$INSTDIR\RetailEX_VPN.exe" --install'
  
  ; Start services
  Exec 'net start RetailEX_Service'
  Exec 'net start RetailEX_VPN'
  
    

  
  ; Write bootstrap config for the backend to consume on first run
  FileOpen $9 "$INSTDIR\bootstrap.json" w
  ${If} $UseLogoObj == 1
    StrCpy $1 "true"
  ${Else}
    StrCpy $1 "false"
  ${EndIf}
  ${If} $UseFixedVpnIp == 1
    StrCpy $2 "true"
  ${Else}
    StrCpy $2 "false"
  ${EndIf}
  FileWrite $9 '{ "central_ws_url": "$WSUrl", "amqp_url": "$AMQPUrl", "logo_objects_user": "$LogoObjUser", "logo_objects_pass": "$LogoObjPass", "logo_objects_path": "$LogoObjPath", "logo_objects_active": $1, "use_fixed_vpn_ip": $2 }'
  FileClose $9

  ; Write Summary for Notepad
  FileOpen $9 "$INSTDIR\RETAILEX_INSTALL_INFO.txt" w
  FileWrite $9 "========================================================$\r$\n"
  FileWrite $9 "           RetailEX KURULUM ÖZETİ & BİLGİLENDİRME        $\r$\n"
  FileWrite $9 "========================================================$\r$\n$\r$\n"
  FileWrite $9 "Kurulum Tarihi: ${__DATE__} ${__TIME__}$\r$\n"
  ${If} $InstallRole == 1
    FileWrite $9 "Kurulum Rolü: MERKEZİ SUNUCU (Server)$\r$\n"
  ${Else}
    FileWrite $9 "Kurulum Rolü: TERMİNAL (Kasa)$\r$\n"
  ${EndIf}
  FileWrite $9 "$\r$\nServis Durumları:$\r$\n"
  FileWrite $9 "- RetailEX Sync Service: KURULDU & ÇALIŞIYOR$\r$\n"
  FileWrite $9 "- RetailEX VPN (Wintun): KURULDU & ÇALIŞIYOR$\r$\n"
  ${If} $InstallRole == 1
    FileWrite $9 "- Redis (Memory Cache): KURULDU$\r$\n"
    FileWrite $9 "- RabbitMQ (Messaging): KURULDU$\r$\n"
    ${If} $UseLogoObj == 1
      FileWrite $9 "- RetailEX Logo Connector: KURULDU & ÇALIŞIYOR$\r$\n"
    ${Else}
      FileWrite $9 "- RetailEX Logo Connector: ATLANDI (Seçilmedi)$\r$\n"
    ${EndIf}
  ${EndIf}
  FileWrite $9 "$\r$\nBağlantı Bilgileri:$\r$\n"
  FileWrite $9 "- WebSocket: $WSUrl$\r$\n"
  FileWrite $9 "- Messaging: $AMQPUrl$\r$\n"
  FileWrite $9 "$\r$\nÖnemli Notlar:$\r$\n"
  FileWrite $9 "1. Eğer Logo bağlantısı aktifse, LObjects.dll yolunun doğruluğunu kontrol edin.$\r$\n"
  FileWrite $9 "2. Güvenlik duvarından (Firewall) 8000, 5432 ve 6379 portlarına izin verildiğinden emin olun.$\r$\n"
  FileWrite $9 "3. Wintun VPN IP adresi ($WSUrl) üzerinden terminaller merkeze bağlanabilir.$\r$\n"
  FileWrite $9 "$\r$\nRetailEX Enterprise OS - Keyifli kullanımlar!$\r$\n"
  FileClose $9

  ; Open the summary in Notepad immediately
  Exec 'notepad.exe "$INSTDIR\RETAILEX_INSTALL_INFO.txt"'

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Save current MAINBINARYNAME for future updates from v2 updater
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "${ESTIMATEDSIZE}"
  
  ; Save persisted settings for updates
  WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "InstallRole" $InstallRole
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "WSUrl" "$WSUrl"
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "AMQPUrl" "$AMQPUrl"
  WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "UseFixedVpnIp" $UseFixedVpnIp
  WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "UseLogoObj" $UseLogoObj

  ; Create start menu shortcut (GUI)
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create shortcuts for silent and passive installers, which
  ; can be disabled by passing `/NS` flag
  ; GUI installer has buttons for users to control creating them
  IfSilent check_ns_flag 0
  ${IfThen} $PassiveMode == 1 ${|} Goto check_ns_flag ${|}
  Goto shortcuts_done
  check_ns_flag:
    ${GetOptions} $CMDLINE "/NS" $R0
    IfErrors 0 shortcuts_done
      Call CreateDesktopShortcut
      Call CreateStartMenuShortcut
  shortcuts_done:

  ; Auto close this page for passive mode
  ${IfThen} $PassiveMode == 1 ${|} SetAutoClose true ${|}
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  IfSilent check_r_flag 0
  ${IfThen} $PassiveMode == 1 ${|} Goto check_r_flag ${|}
  Goto run_done
  check_r_flag:
    ${GetOptions} $CMDLINE "/R" $R0
    IfErrors run_done 0
      ${GetOptions} $CMDLINE "/ARGS" $R0
      ; nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "$R0"
      Exec '"$INSTDIR\${MAINBINARYNAME}.exe" $R0'
  run_done:
FunctionEnd

Function un.onInit
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE
FunctionEnd

!macro DeleteAppUserModelId
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_DestinationList} ${IID_ICustomDestinationList} r1 ""
  ${If} $1 P<> 0
    ${ICustomDestinationList::DeleteList} $1 '("${BUNDLEID}")'
    ${IUnknown::Release} $1 ""
  ${EndIf}
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ApplicationDestinations} ${IID_IApplicationDestinations} r1 ""
  ${If} $1 P<> 0
    ${IApplicationDestinations::SetAppID} $1 '("${BUNDLEID}")i.r0'
    ${If} $0 >= 0
      ${IApplicationDestinations::RemoveAllDestinations} $1 ''
    ${EndIf}
    ${IUnknown::Release} $1 ""
  ${EndIf}
!macroend

; From https://stackoverflow.com/a/42816728/16993372
!macro UnpinShortcut shortcut
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_StartMenuPin} ${IID_IStartMenuPinnedList} r0 ""
  ${If} $0 P<> 0
      System::Call 'SHELL32::SHCreateItemFromParsingName(ws, p0, g "${IID_IShellItem}", *p0r1)' "${shortcut}"
      ${If} $1 P<> 0
          ${IStartMenuPinnedList::RemoveFromList} $0 '(r1)'
          ${IUnknown::Release} $1 ""
      ${EndIf}
      ${IUnknown::Release} $0 ""
  ${EndIf}
!macroend

Section Uninstall
  !insertmacro CheckIfAppIsRunning

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
    Delete "$INSTDIR\_up_\database\init\04_demo.sql"
    Delete "$INSTDIR\_up_\database\migrations\001_foundation.sql"
    Delete "$INSTDIR\_up_\database\migrations\002_core_logic.sql"
    Delete "$INSTDIR\_up_\database\migrations\003_vertical_and_enterprise.sql"
    Delete "$INSTDIR\_up_\database\migrations\004_seed_data.sql"
    Delete "$INSTDIR\_up_\database\sys\.keep"

  ; Stop and Uninstall Services
  ExecWait 'net stop RetailEX_Service'
  ExecWait 'net stop RetailEX_VPN'
  ExecWait 'net stop RetailEXLogoConnector'
  ExecWait '"$INSTDIR\RetailEX_Service.exe" --uninstall'
  ExecWait '"$INSTDIR\RetailEX_VPN.exe" --uninstall'
  IfFileExists "$INSTDIR\RetailEX_Logo_Connector.exe" 0 +2
    ExecWait '"$INSTDIR\RetailEX_Logo_Connector.exe" --uninstall'

  ; Delete external binaries
    Delete "$INSTDIR\RetailEX_Service.exe"
    Delete "$INSTDIR\RetailEX_VPN.exe"
    Delete "$INSTDIR\RetailEX_Logo_Connector.exe"

  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  RMDir /REBOOTOK "$INSTDIR\_up_\database\init"
  RMDir /REBOOTOK "$INSTDIR\_up_\database\migrations"
  RMDir /REBOOTOK "$INSTDIR\_up_\database\sys"
  RMDir /REBOOTOK "$INSTDIR\_up_\database"
  RMDir /REBOOTOK "$INSTDIR\_up_"
  RMDir "$INSTDIR"

  !insertmacro DeleteAppUserModelId
  !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk"
  !insertmacro UnpinShortcut "$DESKTOP\${MAINBINARYNAME}.lnk"

  ; Remove start menu shortcut
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  Delete "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk"
  RMDir "$SMPROGRAMS\$AppStartMenuFolder"

  ; Remove desktop shortcuts
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"

  ; Delete app data
  ${If} $DeleteAppDataCheckboxState == 1
    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}

  ${GetOptions} $CMDLINE "/P" $R0
  IfErrors +2 0
    SetAutoClose true
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +3 0
    StrCpy $INSTDIR $4
    
  ; Restore Role and URLs
  ReadRegDWORD $R1 SHCTX "${MANUPRODUCTKEY}" "InstallRole"
  ${If} $R1 != ""
    StrCpy $InstallRole $R1
  ${EndIf}
  
  ReadRegStr $R2 SHCTX "${MANUPRODUCTKEY}" "WSUrl"
  ${If} $R2 != ""
    StrCpy $WSUrl $R2
  ${EndIf}
  
  ReadRegStr $R3 SHCTX "${MANUPRODUCTKEY}" "AMQPUrl"
  ${If} $R3 != ""
    StrCpy $AMQPUrl $R3
  ${EndIf}
  
  ReadRegDWORD $R4 SHCTX "${MANUPRODUCTKEY}" "UseFixedVpnIp"
  ${If} $R4 != ""
    StrCpy $UseFixedVpnIp $R4
  ${EndIf}

  ReadRegDWORD $R5 SHCTX "${MANUPRODUCTKEY}" "UseLogoObj"
  ${If} $R5 != ""
    StrCpy $UseLogoObj $R5
  ${EndIf}
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode == 1  ${|} Abort ${|}
FunctionEnd

!macro SetLnkAppUserModelId shortcut
  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
  ${If} $0 P<> 0
    ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
    ${If} $1 P<> 0
      ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READWRITE})'
      ${IUnknown::QueryInterface} $0 '("${IID_IPropertyStore}",.r2)'
      ${If} $2 P<> 0
        System::Call 'Oleaut32::SysAllocString(w "${BUNDLEID}") i.r3'
        System::Call '*${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_ID})p.r4'
        System::Call '*${SYSSTRUCT_PROPVARIANT}(${VT_BSTR},,&i4 $3)p.r5'
        ${IPropertyStore::SetValue} $2 '($4,$5)'

        System::Call 'Oleaut32::SysFreeString($3)'
        System::Free $4
        System::Free $5
        ${IPropertyStore::Commit} $2 ""
        ${IUnknown::Release} $2 ""
        ${IPersistFile::Save} $1 '("${shortcut}",1)'
      ${EndIf}
      ${IUnknown::Release} $1 ""
    ${EndIf}
    ${IUnknown::Release} $0 ""
  ${EndIf}
!macroend

Function CreateDesktopShortcut
  CreateShortcut "$DESKTOP\${MAINBINARYNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${MAINBINARYNAME}.lnk"
FunctionEnd

Function CreateStartMenuShortcut
  CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
  CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${MAINBINARYNAME}.lnk"
FunctionEnd
