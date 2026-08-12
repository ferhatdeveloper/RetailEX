; RetailEX TeraziManager - Windows Kurulum
#define MyAppName "RetailEX TeraziManager"
#define MyAppVersion "1.0.8"
#define MyAppPublisher "RetailEX"
#define MyAppURL "https://github.com/ferhatdeveloper/RetailEX"
#define MyAppExeName "RetailEX.TeraziManager.exe"

[Setup]
AppId={{A7B3C4D5-E6F7-4890-ABCD-RETAILTERAZI01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\RetailEX\TeraziManager
DefaultGroupName=RetailEX
DisableProgramGroupPage=yes
LicenseFile=
OutputDir=output
OutputBaseFilename=RetailEX.TeraziManager-Setup-{#MyAppVersion}
SetupIconFile=..\WindowsFormsApplication1\Resources\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x86 x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion=1.0.8.0
VersionInfoCompany=RetailEX
VersionInfoDescription=RetailEX Terazi Yonetim ve Senkron Kurulumu
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaustu kisayolu olustur"; GroupDescription: "Ek secenekler:"; Flags: unchecked
Name: "installservice"; Description: "Windows senkron servisini kur (RetailEX_Terazi_Sync)"; GroupDescription: "Ek secenekler:"; Flags: unchecked

[Dirs]
Name: "{commonappdata}\RetailEX"; Permissions: users-modify
Name: "{commonappdata}\RetailEX\Rongta"; Permissions: users-modify

[Files]
Source: "payload\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\RetailEX.TeraziManager.exe.config"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\TeraziRongta.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\Newtonsoft.Json.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\rtslabelscale.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\SYSTEM.CFG"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\testRT.RLS"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\RetailEX_Terazi_Sync.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\install-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\Rongta\*"; DestDir: "{app}\Rongta"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "payload\terazi-sync.example.json"; DestDir: "{commonappdata}\RetailEX"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Terazi Senkron Servisi Kur"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; IconFilename: "{app}\{#MyAppExeName}"; Comment: "Yonetici olarak calistirin"
Name: "{group}\RetailEX Kaldir"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{#MyAppName} uygulamasini ac"; Flags: nowait postinstall skipifsilent
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Flags: runhidden; Tasks: installservice; StatusMsg: "Senkron servisi kuruluyor..."

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  CfgDir, RongtaDir, ExampleCfg, TargetCfg: String;
  AppDir: String;
  SrcFile, DestFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    CfgDir := ExpandConstant('{commonappdata}\RetailEX');
    RongtaDir := CfgDir + '\Rongta';
    ExampleCfg := CfgDir + '\terazi-sync.example.json';
    TargetCfg := CfgDir + '\terazi-sync.json';
    AppDir := ExpandConstant('{app}');
    if not DirExists(CfgDir) then
      CreateDir(CfgDir);
    if not DirExists(RongtaDir) then
      CreateDir(RongtaDir);
    if not FileExists(ExampleCfg) then
      FileCopy(ExpandConstant('{src}\payload\terazi-sync.example.json'), ExampleCfg, False);
    if not FileExists(TargetCfg) then
      FileCopy(ExampleCfg, TargetCfg, False);

    DestFile := RongtaDir + '\SYSTEM.CFG';
    if not FileExists(DestFile) then
    begin
      SrcFile := AppDir + '\SYSTEM.CFG';
      if FileExists(SrcFile) then
        FileCopy(SrcFile, DestFile, False);
    end;

    DestFile := RongtaDir + '\testRT.RLS';
    if not FileExists(DestFile) then
    begin
      SrcFile := AppDir + '\testRT.RLS';
      if FileExists(SrcFile) then
        FileCopy(SrcFile, DestFile, False);
    end;
    DestFile := RongtaDir + '\retailex_logoluetiket.scr';
    if not FileExists(DestFile) then
    begin
      SrcFile := AppDir + '\Rongta\retailex_logoluetiket.scr';
      if FileExists(SrcFile) then
        FileCopy(SrcFile, DestFile, False);
    end;
    DestFile := RongtaDir + '\EN1_logo_OUT.scr';
    if not FileExists(DestFile) then
    begin
      SrcFile := AppDir + '\Rongta\EN1_logo_OUT.scr';
      if FileExists(SrcFile) then
        FileCopy(SrcFile, DestFile, False);
    end;
  end;
end;
