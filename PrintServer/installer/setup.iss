#ifndef MyAppVersion
#define MyAppVersion "1.0.0"
#endif

#define MyAppName "RetailEX Printer"
#define MyAppPublisher "RetailEX"
#define MyAppURL "https://github.com/ferhatdeveloper/RetailEX"
#define MyAppExeName "RetailEX.QrPrint.exe"
#define MyServiceExeName "RetailEX_Printer_Service.exe"

[Setup]
AppId={{9C3E2A11-7B4F-4D8A-9E21-A1B2C3D4E5F6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\RetailEX\Printer
DefaultGroupName=RetailEX
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=RetailEX.Printer-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany=RetailEX
VersionInfoDescription=RetailEX Printer Servisi Kurulumu
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayolu oluştur"; GroupDescription: "Ek seçenekler:"; Flags: unchecked
Name: "installservice"; Description: "Windows yazıcı servisini kur (RetailEX Printer Servisi)"; GroupDescription: "Ek seçenekler:"; Flags: checkedonce

[Dirs]
Name: "{commonappdata}\RetailEX"; Permissions: users-modify
Name: "{commonappdata}\RetailEX\QrPrint"; Permissions: users-modify
Name: "{commonappdata}\RetailEX\QrPrint\Service"; Permissions: users-modify

[Files]
Source: "..\releases\RetailEX.Printer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\install-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\uninstall-service.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Yazıcı Servisi Kur"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Install"; Comment: "Yönetici olarak çalıştırın"
Name: "{group}\Yazıcı Servisi Durumu"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Status"; Comment: "Servis durumunu göster"
Name: "{group}\RetailEX Kaldır"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Install -NonInteractive"; Flags: runhidden waituntilterminated skipifdoesntexist; Tasks: installservice; StatusMsg: "Sistem gereksinimleri kontrol ediliyor ve yazıcı servisi kuruluyor..."
Filename: "{app}\{#MyAppExeName}"; Description: "RetailEX Printer'ı başlat"; Flags: nowait postinstall skipifsilent unchecked

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall -NonInteractive"; Flags: runhidden waituntilterminated; RunOnceId: "StopPrinterService"

[Code]
function IsSpoolerOk(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('sc.exe', 'config Spooler start= auto', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('sc.exe', 'start Spooler', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

function InitializeSetup(): Boolean;
var
  FreeMb, TotalMb: Cardinal;
  ResultCode: Integer;
begin
  Result := False;

  if not IsWin64 then
  begin
    MsgBox('RetailEX Printer 64-bit Windows 10 veya Windows 11 gerektirir.', mbError, MB_OK);
    exit;
  end;

  if GetWindowsVersion < $0A000000 then
  begin
    MsgBox('Windows 10 (1809) veya Windows 11 gerekli.', mbError, MB_OK);
    exit;
  end;

  if not GetSpaceOnDisk(ExpandConstant('{autopf}'), True, FreeMb, TotalMb) then
  begin
    if not GetSpaceOnDisk('C:\', True, FreeMb, TotalMb) then
      FreeMb := 9999;
  end;
  if FreeMb < 400 then
  begin
    MsgBox('Kurulum için en az 400 MB boş disk alanı gerekli.', mbError, MB_OK);
    exit;
  end;

  Exec('sc.exe', 'query Spooler', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode <> 0 then
  begin
    MsgBox('Yazdırma Biriktiricisi (Print Spooler) bulunamadı. Windows yazdırma hizmeti olmadan kurulum yapılamaz.', mbError, MB_OK);
    exit;
  end;

  IsSpoolerOk();
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  NeedsRestart := False;
  Result := '';
  Exec('sc.exe', 'stop RetailEX_Printer', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('sc.exe', 'stop RetailEX_QrPrint', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('sc.exe', 'stop RetailEX_PrintServer', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1500);
end;

function IsPrinterServiceRunning(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('sc.exe', 'query RetailEX_Printer', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode <> 0 then
  begin
    Result := False;
    exit;
  end;
  Result := Exec('powershell.exe',
    '-NoProfile -Command "if ((Get-Service -Name RetailEX_Printer -ErrorAction SilentlyContinue).Status -eq ''Running'') { exit 0 } else { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if WizardIsTaskSelected('installservice') then
    begin
      if not IsPrinterServiceRunning() then
      begin
        MsgBox(
          'Dosyalar kopyalandı ancak RetailEX Printer Servisi çalışmıyor.' + #13#10#13#10 +
          'Başlat menüsü → RetailEX → Yazıcı Servisi Kur kısayolunu yönetici olarak çalıştırın.' + #13#10 +
          'Günlük: C:\ProgramData\RetailEX\QrPrint\qrprint-service.log',
          mbError, MB_OK);
      end;
    end;
  end;
end;
