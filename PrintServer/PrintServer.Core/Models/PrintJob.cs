using System;
using System.Collections.Generic;

namespace RetailEX.PrintServer.Core.Models;

/// <summary>
/// PostgREST'ten okunan tek bir print_jobs satirini temsil eder.
/// Tablo: rest.rex_{firmNr}_{periodNr}_print_jobs (firm/period tablodan gelir).
/// </summary>
public sealed class PrintJob
{
    /// <summary>PostgreSQL row uuid.</summary>
    public Guid Id;

    /// <summary>Job tipi (PrintJobTypes sabitlerinden biri).</summary>
    public string JobType = "";

    /// <summary>Durum (queued | printing | done | failed | cancelled).</summary>
    public string Status = "queued";

    /// <summary>Yuksek = once.</summary>
    public int Priority;

    /// <summary>Network icin: tcp | http | bluetooth | usb | system.</summary>
    public string? Connection;

    /// <summary>Network IP/host veya USB device URI.</summary>
    public string? Address;

    /// <summary>Network port (opsiyonel).</summary>
    public int? Port;

    /// <summary>Sistem yazici adi (system connection).</summary>
    public string? PrinterName;

    /// <summary>Tenant routing config'deki PrinterProfile.Id referansi.</summary>
    public string? PrinterProfileId;

    /// <summary>tr | en | ar | ku.</summary>
    public string? Locale;

    /// <summary>Kopya sayisi (varsayilan 1).</summary>
    public int Copies = 1;

    /// <summary>PostgREST'ten gelen ham payload JSON metni.</summary>
    public string? PayloadJson;

    /// <summary>Parse edilmis payload (Newtonsoft Dictionary).</summary>
    public Dictionary<string, object?>? Payload;

    /// <summary>Referans tipi (sales_invoice, kitchen_order, vb.).</summary>
    public string? RefType;

    /// <summary>Referans id (genelde UUID).</summary>
    public string? RefId;

    /// <summary>Yapilan deneme sayisi.</summary>
    public int Attempts;

    /// <summary>Son hata mesaji (basarisiz ise).</summary>
    public string? LastError;

    /// <summary>3 haneli firma numarasi (tablo adindan degil, satirin kendisinden).</summary>
    public string FirmNr = "";

    /// <summary>2 haneli donem numarasi.</summary>
    public string PeriodNr = "";

    /// <summary>Kaynak tablonun tam adi (ornek: rest.rex_001_01_print_jobs).</summary>
    public string TableName = "";
}