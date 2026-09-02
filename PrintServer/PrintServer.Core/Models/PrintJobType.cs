using System;
using System.Collections.Generic;

namespace RetailEX.PrintServer.Core.Models;

/// <summary>
/// Print is tipleri — enum yerine sabit string listesi.
/// Is mantigi bu stringleri PostgREST'ten gelen job_type ile karsilastirir.
/// </summary>
public static class PrintJobTypes
{
    public const string KitchenTicket     = "kitchen_ticket";
    public const string EscposRaw         = "escpos_raw";
    public const string HtmlDocument      = "html_document";
    public const string PosReceipt80      = "pos_receipt_80";
    public const string AccountReceipt    = "account_receipt";
    public const string InvoiceA4         = "invoice_a4";
    public const string ReportHtml        = "report_html";
    public const string ProductLabel      = "product_label";
    public const string FastReportTemplate = "fastreport_template";
    public const string FastReportFrx     = "fastreport_frx";
    public const string TestPage          = "test_page";
    public const string PriceChangeVoucher = "price_change_voucher";

    private static readonly HashSet<string> HtmlBased = new(StringComparer.OrdinalIgnoreCase)
    {
        HtmlDocument, PosReceipt80, AccountReceipt, InvoiceA4,
        ReportHtml, ProductLabel, PriceChangeVoucher
    };

    private static readonly HashSet<string> NetworkBased = new(StringComparer.OrdinalIgnoreCase)
    {
        KitchenTicket, EscposRaw, TestPage
    };

    private static readonly HashSet<string> FastReport = new(StringComparer.OrdinalIgnoreCase)
    {
        FastReportTemplate, FastReportFrx
    };

    /// <summary>HTML tabanli job tipleri (browser/sumatra ile basilir).</summary>
    public static bool IsHtmlBased(string? jobType) =>
        !string.IsNullOrWhiteSpace(jobType) && HtmlBased.Contains(jobType);

    /// <summary>Network yaziciya raw byte gonderilen tipler (kitchen/escpos/test).</summary>
    public static bool IsNetworkBased(string? jobType) =>
        !string.IsNullOrWhiteSpace(jobType) && NetworkBased.Contains(jobType);

    /// <summary>FastReport CLI ile islenecek tipler.</summary>
    public static bool IsFastReport(string? jobType) =>
        !string.IsNullOrWhiteSpace(jobType) && FastReport.Contains(jobType);

    /// <summary>Tum bilinen tiplerin listesi (config UI / test icin).</summary>
    public static IReadOnlyList<string> All { get; } = new[]
    {
        KitchenTicket, EscposRaw, HtmlDocument, PosReceipt80, AccountReceipt,
        InvoiceA4, ReportHtml, ProductLabel, FastReportTemplate, FastReportFrx,
        TestPage, PriceChangeVoucher
    };
}