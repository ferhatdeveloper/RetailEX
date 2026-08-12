using System;
using System.ServiceProcess;

namespace TeraziRongta.Service
{
    internal static class Program
    {
        static void Main(string[] args)
        {
            if (args.Length > 0)
            {
                var cmd = args[0].Trim().ToLowerInvariant();
                if (cmd == "--console")
                {
                    RunConsoleMode();
                    return;
                }
            }

            ServiceBase.Run(new ServiceBase[] { new ScaleSyncWindowsService() });
        }

        private static void RunConsoleMode()
        {
            Console.Title = "RetailEX Terazi Sync (Konsol)";
            var engine = new TeraziRongta.Core.Services.SyncEngine();
            engine.Log += msg => Console.WriteLine("[{0:HH:mm:ss}] {1}", DateTime.Now, msg);
            Console.WriteLine("Konsol modu — Ctrl+C ile cikis.");
            engine.RunSync();
            Console.WriteLine("Bitti. Enter...");
            Console.ReadLine();
        }
    }
}
