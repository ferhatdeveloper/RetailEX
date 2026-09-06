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
; v0.1.13+ qrprint kalibi: framework-dependent dotnet build her zaman
; apphost .exe uretir. .cmd shim kaldirildi; kisayol dogrudan EXE'ye.
Source: "payload\designer\RetailEX.FastReportDesigner.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\RetailEX.FastReportDesigner.exe"; DestDir: "{app}\Designer"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner
Source: "payload\designer\RetailEX.FastReportDesigner.pdb"; DestDir: "{app}\Designer"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner
Source: "payload\designer\RetailEX.FastReportDesigner.runtimeconfig.json"; DestDir: "{app}\Designer"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner
Source: "payload\designer\RetailEX.PrintServer.Core.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\Newtonsoft.Json.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\Microsoft.Extensions.*.dll"; DestDir: "{app}\Designer"; Flags: ignoreversion recursesubdirs createallsubdirs; Tasks: installdesigner
Source: "payload\designer\designer.config.example.json"; DestDir: "{app}\Designer"; Flags: ignoreversion; Tasks: installdesigner
Source: "payload\designer\lib\FastReport.dll"; DestDir: "{app}\Designer\lib"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner
Source: "payload\designer\lib\FastReport.Bars.dll"; DestDir: "{app}\Designer\lib"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner
Source: "payload\designer\lib\FastReport.Editor.dll"; DestDir: "{app}\Designer\lib"; Flags: ignoreversion skipifsourcedoesntexist; Tasks: installdesigner

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\FastReport Tasarimci"; Filename: "{app}\Designer\RetailEX.FastReportDesigner.exe"; Tasks: installdesigner; Check: FileExists(ExpandConstant('{app}\Designer\RetailEX.FastReportDesigner.exe'))
Name: "{group}\Yazici Servisi Kur"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Comment: "Yonetici olarak calistirin"
Name: "{group}\Yapilandirma"; Filename: "notepad.exe"; Parameters: "{commonappdata}\RetailEX\print-server.json"
Name: "{group}\RetailEX Kaldir"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{autodesktop}\FastReport Tasarimci"; Filename: "{app}\Designer\RetailEX.FastReportDesigner.exe"; Tasks: installdesigner; Check: FileExists(ExpandConstant('{app}\Designer\RetailEX.FastReportDesigner.exe'))

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"""; Flags: runhidden waituntilterminated skipifdoesntexist; Tasks: installservice; StatusMsg: "Yazici servisi kuruluyor..."

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall"; Flags: runhidden waituntilterminated

[Code]
const
  DesignerExeName = 'RetailEX.FastReportDesigner.exe';

procedure CurStepChanged(CurStep: TSetupStep);
var
  CfgDir, PrintDir, ExampleCfg, TargetCfg: String;
  DesignerDir, DesignerExe, DesignerLibFastReport: String;
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

    // Designer kurulduysa: .NET 8 Desktop Runtime kontrolu
    DesignerDir := ExpandConstant('{app}\Designer');
    DesignerExe := DesignerDir + '\' + DesignerExeName;
    if FileExists(DesignerExe) then
    begin
      // Apphost framework-dependent; .NET 8 Desktop Runtime gerekli.
      // dotnet --list-runtimes ciktisini kontrol etmek icin Installer
      // process icinden shell out yapamiyoruz; bunun yerine LaunchApplication
      // denemesi yerine sadece uyari gosterelim. Designer'i ilk calistirmada
      // kullanici .NET yoksa Windows zaten 'You must install .NET Desktop Runtime'
      // uyarisi verecektir.
      // Ek olarak registry tabanli hizli kontrol:
      if not RegKeyExists(HKLM, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App\8.') then
      begin
        MsgBox(
          'FastReport Tasarimci acmak icin .NET 8 Desktop Runtime gerekli.' + #13#10#13#10 +
          'Kurmak icin: https://dotnet.microsoft.com/download/dotnet/8.0' + #13#10 +
          '"Windows Desktop Runtime 8.x (x64)" secenegini indirip kurun.' + #13#10#13#10 +
          'Kurulum tamamlandiktan sonra bilgisayari yeniden baslatip ' +
          'FastReport Tasarimci kisayolunu tekrar calistirin.',
          mbInformation, MB_OK);
      end;
    end;

    // FastReport lisansli DLL'leri pakete dahil edilmediyse kullaniciya uyari goster
    DesignerLibFastReport := DesignerDir + '\lib\FastReport.dll';
    if not FileExists(DesignerLibFastReport) then
    begin
      MsgBox(
        'FastReport tasarim araci kuruldu, ancak lisansli FastReport ' +
        'DLL''leri (FastReport.dll, FastReport.Bars.dll, FastReport.Editor.dll) ' +
        'bu pakete dahil edilmedi. Tasarim araci bu dosyalar olmadan acilmaz.' + #13#10#13#10 +
        DesignerDir + '\lib klasorune ilgili DLL''leri kopyalayin ve ' +
        'FastReport Tasarimci kisayolunu yeniden calistirin.',
        mbInformation, MB_OK);
    end;
  end;
end;