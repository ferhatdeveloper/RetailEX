; RetailEX TeraziManager â€” Windows kurulum paketi (Inno Setup 6)
; Derleme: ISCC.exe setup\TeraziManager.iss /DAppVersion=1.0.0

#ifndef AppVersion
  #define AppVersion "1.0.1"
#endif

#ifndef StagingDir
  #define StagingDir "staging"
#endif

#define AppName "RetailEX Terazi Yoneticisi"
#define AppPublisher "RetailEX"
#define AppExeName "RetailEX.TeraziManager.exe"
#define ServiceExeName "RetailEX_Terazi_Sync.exe"
#define ServiceName "RetailEX_Terazi_Sync"
#define ConfigDir "{commonappdata}\RetailEX"
#define RongtaConfigDir "{commonappdata}\RetailEX\Rongta"

[Setup]
AppId={{A7B3C9D1-4E2F-5A6B-8C9D-0E1F2A3B4C5D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://github.com/ferhatdeveloper/RetailEX
AppSupportURL=https://github.com/ferhatdeveloper/RetailEX/issues
AppUpdatesURL=https://github.com/ferhatdeveloper/RetailEX/releases
DefaultDirName={autopf}\RetailEX\TeraziManager
DefaultGroupName=RetailEX
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=RetailEX.TeraziManager-Setup
SetupIconFile=..\WindowsFormsApplication1\Resources\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x86
ArchitecturesInstallIn64BitMode=
MinVersion=10.0
UninstallDisplayIcon={app}\{#AppExeName}
VersionInfoVersion={#AppVersion}.0

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Types]
Name: "full"; Description: "Tam kurulum (uygulama + servis)"
Name: "compact"; Description: "Yalnizca yonetim arayuzu"
Name: "custom"; Description: "Ozel kurulum"; Flags: iscustom

[Components]
Name: "app"; Description: "Terazi Yoneticisi (masaustu arayuz)"; Types: full compact custom; Flags: fixed
Name: "service"; Description: "Windows Senkron Servisi (arka planda otomatik gonderim)"; Types: full custom

[Tasks]
Name: "desktopicon"; Description: "Masaustu kisayolu olustur"; GroupDescription: "Ek kisayollar:"; Components: app
Name: "launchapp"; Description: "Kurulum bitince Terazi Yoneticisini ac"; GroupDescription: "Kurulum sonrasi:"; Components: app; Flags: unchecked

[Files]
; Yonetim arayuzu
Source: "{#StagingDir}\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: app
; Windows servisi (ayri alt klasor)
Source: "{#StagingDir}\service\*"; DestDir: "{app}\Service"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: service
; Servis kurulum scripti
Source: "{#StagingDir}\install-service.ps1"; DestDir: "{app}"; Flags: ignoreversion; Components: service
; Ornek yapilandirma (ProgramData)
Source: "{#StagingDir}\config\terazi-sync.example.json"; DestDir: "{#ConfigDir}"; DestName: "terazi-sync.example.json"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall

[Dirs]
Name: "{#ConfigDir}"; Permissions: users-modify
Name: "{#RongtaConfigDir}"; Permissions: users-modify

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Components: app
Name: "{group}\Yapilandirma dosyasini ac"; Filename: "notepad.exe"; Parameters: """{#ConfigDir}\terazi-sync.json"""; Components: app
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; Components: app

[Run]
; Ilk kurulumda ornek config'ten gercek config olustur
Filename: "{cmd}"; Parameters: "/C if not exist ""{#ConfigDir}\terazi-sync.json"" copy /Y ""{#ConfigDir}\terazi-sync.example.json"" ""{#ConfigDir}\terazi-sync.json"""; Flags: runhidden; StatusMsg: "Yapilandirma dosyasi hazirlaniyor..."
; Windows servisi kur
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; StatusMsg: "Windows servisi kuruluyor..."; Components: service
; Uygulamayi ac
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent; Tasks: launchapp; Components: app

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$s=Get-Service -Name '{#ServiceName}' -ErrorAction SilentlyContinue; if($s){{Stop-Service '{#ServiceName}' -Force -ErrorAction SilentlyContinue; sc.exe delete '{#ServiceName}' | Out-Null}}"""; Flags: runhidden waituntilterminated; Components: service

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  SrcFile, DestFile: String;
begin
  if CurStep = ssPostInstall then
  begin
    if not FileExists(ExpandConstant('{#ConfigDir}\terazi-sync.json')) then
    begin
      if FileExists(ExpandConstant('{#ConfigDir}\terazi-sync.example.json')) then
        FileCopy(ExpandConstant('{#ConfigDir}\terazi-sync.example.json'),
                 ExpandConstant('{#ConfigDir}\terazi-sync.json'), False);
    end;

    DestFile := ExpandConstant('{#RongtaConfigDir}\SYSTEM.CFG');
    if not FileExists(DestFile) then
    begin
      SrcFile := ExpandConstant('{app}\SYSTEM.CFG');
      if FileExists(SrcFile) then
        FileCopy(SrcFile, DestFile, False);
    end;

    DestFile := ExpandConstant('{#RongtaConfigDir}\testRT.RLS');
    if not FileExists(DestFile) then
    begin
      SrcFile := ExpandConstant('{app}\testRT.RLS');
      if FileExists(SrcFile) then
        FileCopy(SrcFile, DestFile, False);
    end;
  end;
end;

[Messages]
turkish.WelcomeLabel2=Bu sihirbaz [name/ver] uygulamasini bilgisayariniza kuracaktir.%n%nRetailEX Terazi Yoneticisi, Rongta terazileri ile RetailEX API arasinda urun senkronizasyonu saglar.%n%nDevam etmeden once diger uygulamalari kapatmaniz onerilir.
turkish.FinishedLabel=Kurulum tamamlandi.%n%nYapilandirma: C:\ProgramData\RetailEX\terazi-sync.json%nRongta dosyalari: C:\ProgramData\RetailEX\Rongta\%n%nAPI token ve kiraci kodunu config dosyasinda duzenleyin.
