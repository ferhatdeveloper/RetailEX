using System;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;
using TeraziRongta.Core.Config;
using TeraziRongta.Core.Services;

namespace TeraziRongta.Service
{
    public class ScaleSyncWindowsService : ServiceBase
    {
        private Timer _syncTimer;
        private SyncEngine _engine;
        private readonly string _logPath;

        public ScaleSyncWindowsService()
        {
            ServiceName = "RetailEX_Terazi_Sync";
            CanStop = true;
            CanPauseAndContinue = false;
            AutoLog = true;
            _logPath = System.IO.Path.Combine(
                System.IO.Path.GetDirectoryName(AppConfig.DefaultConfigPath) ?? "",
                "terazi-service.log");
        }

        protected override void OnStart(string[] args)
        {
            WriteLog("Servis baslatildi — RLS1000 yerine otomatik RetailEX senkron.");
            _engine = new SyncEngine();
            _engine.Log += WriteLog;

            // Ilk senkron hemen (10 sn), sonraki periyodik
            var intervalMs = Math.Max(1, _engine.Config.SyncIntervalMinutes) * 60 * 1000;
            _syncTimer = new Timer(OnSyncTick, null, 10000, intervalMs);
        }

        protected override void OnStop()
        {
            _syncTimer?.Dispose();
            _syncTimer = null;
            WriteLog("Servis durduruldu.");
        }

        private void OnSyncTick(object state)
        {
            try
            {
                _engine.ReloadConfig();
                if (!_engine.Config.ShouldRunAutoTimerSync())
                {
                    if (_engine.Config.UsesCentralCommands())
                    {
                        var poll = _engine.RunCentralCommandPollAsync().GetAwaiter().GetResult();
                        WriteLog(poll.Message);
                    }
                    else
                    {
                        WriteLog("Otomatik senkron kapali — atlandi.");
                    }
                    return;
                }

                var result = _engine.RunSync("auto");
                WriteLog(result.Message);
            }
            catch (Exception ex)
            {
                WriteLog("Senkron hatasi: " + ex.Message);
            }
        }

        private void WriteLog(string message)
        {
            try
            {
                var line = string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}", DateTime.Now, message);
                System.IO.File.AppendAllText(_logPath, line + Environment.NewLine);
            }
            catch
            {
                /* ignore log failures */
            }
        }
    }
}
