namespace RetailEX.PrintServer.Service;

/// <summary>
/// Windows servisi ve EventLog kayitlari icin kullanilan sabit degerler.
/// </summary>
internal static class ServiceConstants
{
    /// <summary>sc.exe / ServiceName / EventLog Source ile birebir ayni olmali.</summary>
    public const string ServiceName = "RetailEX_PrintServer";

    /// <summary>Windows Service panelinde gorunen ad.</summary>
    public const string DisplayName = "RetailEX Yazici Servisi";

    /// <summary>Windows Service panelinde gorunen aciklama.</summary>
    public const string Description = "RetailEX kiracidan gelen yazdirma isteklerini (POS, fatura, mutfak, etiket) Windows yazicilara ve FastReport ile yonlendirir.";

    /// <summary>EventLog icin kullanilan kaynak adi.</summary>
    public const string EventLogSource = "RetailEX_PrintServer";

    /// <summary>EventLog icin kullanilan gunluk adi (varsayilan Application).</summary>
    public const string EventLogName = "Application";
}