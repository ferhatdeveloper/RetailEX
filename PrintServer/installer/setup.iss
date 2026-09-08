#ifndef MyAppVersion
#define MyAppVersion "1.0.0"
#endif

[Setup]
AppId={{9C3E2A11-7B4F-4D8A-9E21-RETAILEXQRPRINT}
AppName=RetailEX Printer
AppVersion={#MyAppVersion}
AppPublisher=RetailEX
DefaultDirName={localappdata}\RetailEX\Printer
DefaultGroupName=RetailEX
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=RetailEX.Printer-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayIcon={app}\RetailEX.QrPrint.exe
SetupIconFile=..\QrPrintDesktop.App\Assets\app.ico

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\releases\RetailEX.Printer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\RetailEX Printer"; Filename: "{app}\RetailEX.QrPrint.exe"
Name: "{userdesktop}\RetailEX Printer"; Filename: "{app}\RetailEX.QrPrint.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayolu"; GroupDescription: "Ek görevler:"; Flags: checkedonce

[Run]
Filename: "{app}\RetailEX.QrPrint.exe"; Description: "RetailEX Printer'ı başlat"; Flags: nowait postinstall skipifsilent
