using System;
using System.Collections;
using System.ComponentModel;
using System.Configuration.Install;
using System.ServiceProcess;

namespace TeraziRongta.Service
{
    [RunInstaller(true)]
    public class ProjectInstaller : Installer
    {
        public ProjectInstaller()
        {
            var processInstaller = new ServiceProcessInstaller
            {
                Account = ServiceAccount.LocalSystem,
            };

            var serviceInstaller = new ServiceInstaller
            {
                ServiceName = "RetailEX_Terazi_Sync",
                DisplayName = "RetailEX Terazi Senkron Servisi",
                Description = "RetailEX REST API uzerinden urunleri Rongta teraziye otomatik gonderir.",
                StartType = ServiceStartMode.Automatic,
            };

            Installers.Add(processInstaller);
            Installers.Add(serviceInstaller);
        }
    }
}
