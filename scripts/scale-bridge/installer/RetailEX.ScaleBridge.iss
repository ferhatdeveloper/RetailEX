; RetailEX Terazi Köprüsü — Inno Setup kurulumu
; Derleme: scripts/scale-bridge/build-windows-installer.ps1
; Çıktı: dist/RetailEX-ScaleBridge-Setup.exe

#define MyAppName "RetailEX Terazi Köprüsü"
#define MyAppVersion "0.1.74"
#define MyAppPublisher "RetailEX"
#define MyAppURL "https://github.com/ferhatdeveloper/RetailEX"
#define MyAppExeName "RetailEX_ScaleBridge_Manager.exe"

[Setup]
AppId={{A8F3C2E1-9B4D-4E5F-A1C2-3D4E5F6A7B8C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\RetailEX\ScaleBridge
DefaultGroupName=RetailEX
DisableProgramGroupPage=yes
OutputDir=..\..\..\dist
OutputBaseFilename=RetailEX-ScaleBridge-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
; SetupIconFile=..\..\..\DeskApp\icons\icon.ico

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayolu oluştur"; GroupDescription: "Ek kısayollar:"; Flags: unchecked

[Files]
Source: "staging\RetailEX_Scale_Bridge.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\RetailEX_ScaleBridge_Manager.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "staging\scale-bridge\*"; DestDir: "{app}\scale-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "staging\scale-bridge.example.json"; DestDir: "{commonappdata}\RetailEX"; DestName: "scale-bridge.example.json"; Flags: ignoreversion onlyifdoesntexist

[Dirs]
Name: "{commonappdata}\RetailEX"; Permissions: users-modify

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Terazi Köprüsü Kaldır"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--uninstall"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--install"; StatusMsg: "Windows servisi kuruluyor…"; Flags: waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "Terazi Köprüsü yönetim arayüzünü aç"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--uninstall"; Flags: waituntilterminated

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    ConfigPath := ExpandConstant('{commonappdata}\RetailEX\scale-bridge.json');
    if not FileExists(ConfigPath) then
      FileCopy(ExpandConstant('{commonappdata}\RetailEX\scale-bridge.example.json'), ConfigPath, False);
  end;
end;
