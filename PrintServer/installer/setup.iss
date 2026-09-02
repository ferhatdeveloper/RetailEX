; RetailEX PrintServer - Windows Kurulum (Inno Setup 6)
; Calistirma: ISCC.exe /DMyAppVersion=1.0.0 setup.iss
;                veya build-installer.ps1 -Version 1.0.0

#define MyAppName "RetailEX Print Server"
#define MyAppPublisher "RetailEX"
#define MyAppURL "https://github.com/ferhatdeveloper/RetailEX"
#define MyAppExeName "RetailEX_PrintServer.exe"

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
Name: "installservice"; Description: "Windows yazici servisini kur (RetailEX_PrintServer)"; GroupDescription: "Ek secenekler:"; Flags: checked

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

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Yazici Servisi Kur"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Comment: "Yonetici olarak calistirin"
Name: "{group}\Yapilandirma"; Filename: "notepad.exe"; Parameters: "{commonappdata}\RetailEX\print-server.json"
Name: "{group}\RetailEX Kaldir"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Flags: runhidden waituntilterminated skipifdoesntexist; Tasks: installservice; StatusMsg: "Yazici servisi kuruluyor..."

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall"; Flags: runhidden waituntilterminated

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  CfgDir, PrintDir, ExampleCfg, TargetCfg: String;
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
  end;
end;