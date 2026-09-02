; RetailEX PrintServer - Windows Kurulum (Inno Setup 6)
; Calistirma: ISCC.exe /DMyAppVersion=1.0.0 setup.iss
;                veya build-installer.ps1 -Version 1.0.0
;
; Print v0.1.0+ Designer dahil edildi: "Tasarim aracini kur (RetailEX Designer)"
; goreviyle birlikte RetailEX.FastReportDesigner.exe, lib/FastReport*.dll
; ve designer.config.example.json hedef {app}\Designer\Designer\ altina yerlestirilir.

#define MyAppName "RetailEX Print Server"
#define MyAppPublisher "RetailEX"
#define MyAppURL "https://github.com/ferhatdeveloper/RetailEX"
#define MyAppExeName "RetailEX_PrintServer.exe"
#define MyDesignerExeName "RetailEX.FastReportDesigner.exe"

[Setup]
AppId={{B2C4D6E8-F0A1-4B3C-9D5E-RETAILPRINT01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\RetailEX\PrintServer
DefaultGroupName=RetailEX
DisableProgramGroupPage=yes
LicenseFile=
OutputDir=output
OutputBaseFilename=RetailEX.PrintManager-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x86 x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany=RetailEX
VersionInfoDescription=RetailEX Yazici Yonetim Servisi Kurulumu
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaustu kisayolu olustur"; GroupDescription: "Ek secenekler:"; Flags: unchecked
Name: "installservice"; Description: "Windows yazici servisini kur (RetailEX_PrintServer)"; GroupDescription: "Ek secenekler:"; Flags: checkedonce
Name: "installdesigner"; Description: "Tasarim aracini kur (RetailEX FastReport Designer)"; GroupDescription: "Ek secenekler:"; Flags: unchecked

[Dirs]
Name: "{commonappdata}\RetailEX"; Permissions: users-modify
Name: "{commonappdata}\RetailEX\PrintServer"; Permissions: users-modify

[Files]
Source: "payload\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\RetailEX.PrintServer.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\Newtonsoft.Json.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\Microsoft.Extensions.*.dll"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "payload\print-server.example.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\install-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\print-server.example.json"; DestDir: "{commonappdata}\RetailEX"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall

; Designer (yalnizca installdesigner gorevi secildiginde)
; print v0.1.4+: Windows runner + WinForms WinExe bazen sadece DLL uretir
; (apphost .exe uretmiyor). Bu yuzden:
;   1) .exe varsa install edilir (FileExists check)
;   2) .cmd shim her durumda install edilir; .exe varsa onu, yoksa
;      'dotnet <dll>' cagirir. Start Menu kisayolu .cmd'e yonlenir.
Source: "payload\designer\RetailEX.FastReportDesigner.cmd"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\RetailEX.FastReportDesigner.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\RetailEX.FastReportDesigner.exe"; DestDir: "{app}\Designer"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner
Source: "payload\designer\RetailEX.PrintServer.Core.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\Newtonsoft.Json.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\Microsoft.Extensions.*.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion recursesubdirs createallsubdirs; Tasks: installdesigner
Source: "payload\designer\designer.config.example.json"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\lib\FastReport.dll"; DestDir: "{app}\Designer\lib"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\lib\FastReport.Bars.dll"; DestDir: "{app}\Designer\lib"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\lib\FastReport.Editor.dll"; DestDir: "{app}\Designer\lib"; Flags: ignoreversion; Tasks: installdesigner

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\FastReport Tasarimci"; Filename: "{app}\Designer\RetailEX.FastReportDesigner.cmd"; Tasks: installdesigner
Name: "{group}\Yazici Servisi Kur"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Comment: "Yonetici olarak calistirin"
Name: "{group}\Yapilandirma"; Filename: "notepad.exe"; Parameters: "{commonappdata}\RetailEX\print-server.json"
Name: "{group}\RetailEX Kaldir"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{autodesktop}\FastReport Tasarimci"; Filename: "{app}\Designer\RetailEX.FastReportDesigner.cmd"; Tasks: installdesigner

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Flags: runhidden waituntilterminated skipifdoesntexist; Tasks: installservice; StatusMsg: "Yazici servisi kuruluyor..."

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall"; Flags: runhidden waituntilterminated

[Code]
const
  DesignerExeName = 'RetailEX.FastReportDesigner.exe';
  DesignerDllName = 'RetailEX.FastReportDesigner.dll';
  DesignerBatName = 'RetailEX.FastReportDesigner.bat';

procedure CurStepChanged(CurStep: TSetupStep);
var
  CfgDir, PrintDir, ExampleCfg, TargetCfg: String;
  DesignerDir, DesignerExe, DesignerDll: String;
  BatContent: String;
  BatFile: AnsiString;
begin
  if CurStep = ssPostInstall then
  begin
    CfgDir := ExpandConstant('{commonappdata}\RetailEX');
    PrintDir := CfgDir + '\PrintServer';
    ExampleCfg := CfgDir + '\print-server.example.json';
    TargetCfg := CfgDir + '\print-server.json';

    if not DirExists(CfgDir) then
      CreateDir(CfgDir);
    if not DirExists(PrintDir) then
      CreateDir(PrintDir);

    // Ornek config'i CommonApplicationData altinda sadece yoksa kopyala
    if not FileExists(ExampleCfg) then
      FileCopy(ExpandConstant('{src}\payload\print-server.example.json'), ExampleCfg, False);

    // Asil config yoksa ornekten turetilir (kullanici duzenler)
    if not FileExists(TargetCfg) then
      FileCopy(ExampleCfg, TargetCfg, False);

    // Designer: EXE yoksa DLL uzerinden dotnet apphost ile calistiran .bat olustur
    DesignerDir := ExpandConstant('{app}\Designer');
    DesignerExe := DesignerDir + '\' + DesignerExeName;
    DesignerDll := DesignerDir + '\' + DesignerDllName;
    if FileExists(DesignerDll) and not FileExists(DesignerExe) then
    begin
      BatContent :=
        '@echo off' + #13#10 +
        'REM dotnet publish yalniz DLL uretmis; EXE yerine apphost uzerinden calistiriliyor.' + #13#10 +
        'cd /d "%~dp0"' + #13#10 +
        'where dotnet >nul 2>nul' + #13#10 +
        'if errorlevel 1 (' + #13#10 +
        '  echo .NET 8 Desktop Runtime bulunamadi. Lutfen https://dot.net adresinden kurun.' + #13#10 +
        '  pause' + #13#10 +
        '  exit /b 1' + #13#10 +
        ')' + #13#10 +
        'dotnet "' + DesignerDllName + '" %*' + #13#10;
      BatFile := DesignerDir + '\' + DesignerBatName;
      if SaveStringToFile(BatFile, BatContent, False) then
      begin
        // Dosya olustuysa basit bilesen acma icin [Icons] girdileri zaten var; batch yedek.
        Log('Designer fallback .bat olusturuldu: ' + BatFile);
      end;
    end;
  end;
end;