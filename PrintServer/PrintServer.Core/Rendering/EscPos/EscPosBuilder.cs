using System;
using System.Collections.Generic;
using System.Text;
using RetailEX.PrintServer.Core.I18n;

namespace RetailEX.PrintServer.Core.Rendering.EscPos;

/// <summary>
/// Mutfak fişinde bir satır.
/// </summary>
public sealed record KitchenItem(string Name, int Qty, string? Notes, string? Course);

/// <summary>
/// Standart ESC/POS komut byte dizileri ureteci.
/// Tum metodlar stateless ve thread-safe; her cagri yeni bir byte[] doner.
/// </summary>
public static class EscPosBuilder
{
    private const byte ESC = 0x1B;
    private const byte GS = 0x1D;
    private const byte LF = 0x0A;

    /// <summary>ESC @ — yaziciyi resetle / baslangic durumu.</summary>
    public static byte[] Init() => new byte[] { ESC, (byte)'@' };

    /// <summary>ESC E n — bold on/off.</summary>
    public static byte[] Bold(bool on)
    {
        return new byte[] { ESC, (byte)'E', (byte)(on ? 1 : 0) };
    }

    /// <summary>ESC ! n — yazı boyutu (0=normal, 16=double-height, 32=double-width, 48=double).</summary>
    public static byte[] TextSize(bool doubleSize)
    {
        byte n = 0;
        if (doubleSize) n = 0x30; // double width + height
        return new byte[] { ESC, (byte)'!', n };
    }

    /// <summary>ESC a n — hizalama (0=left, 1=center, 2=right).</summary>
    public static byte[] Align(string align)
    {
        var a = (align ?? "left").Trim().ToLowerInvariant();
        byte n = a switch
        {
            "center" or "centre" => 1,
            "right" => 2,
            _ => 0,
        };
        return new byte[] { ESC, (byte)'a', n };
    }

    /// <summary>GS V m — kesme (m=0 full, m=1 partial).</summary>
    public static byte[] Cut(bool full = false)
    {
        return new byte[] { GS, (byte)'V', (byte)(full ? 0 : 1) };
    }

    /// <summary>ESC p m t1 t2 — kasa cekmecesi ac.</summary>
    public static byte[] OpenDrawer()
    {
        return new byte[] { ESC, (byte)'p', 0x00, 25, 250 };
    }

    /// <summary>ESC d n — n satir ilerle.</summary>
    public static byte[] Feed(int lines)
    {
        if (lines < 0) lines = 0;
        if (lines > 255) lines = 255;
        return new byte[] { ESC, (byte)'d', (byte)lines };
    }

    /// <summary>Tek bir text satiri (LF ile biten).</summary>
    public static byte[] TextLine(string text, bool bold = false, bool doubleSize = false)
    {
        if (text == null) text = "";
        var bytes = new List<byte>();
        if (bold || doubleSize) bytes.AddRange(Bold(true));
        if (doubleSize) bytes.AddRange(TextSize(true));
        bytes.AddRange(Encoding.UTF8.GetBytes(text));
        bytes.Add(LF);
        if (bold || doubleSize) bytes.AddRange(Bold(false));
        if (doubleSize) bytes.AddRange(TextSize(false));
        return bytes.ToArray();
    }

    /// <summary>
    /// Minimal mutfak fisi: header + line items + cut.
    /// items.Count == 0 ise sadece header + "Bos" yazisi + cut.
    /// </summary>
    public static byte[] BuildKitchenTicket(
        IReadOnlyList<KitchenItem> items,
        string? header,
        string? orderNote,
        string locale = "tr",
        IDictionary<string, IDictionary<string, string>>? payloadTranslations = null)
    {
        var ms = new MemoryStreamEquivalent();

        var title = header ?? PrintStrings.Resolve(locale, PrintStringKey.KitchenHeader, payloadTranslations);
        var emptyLabel = PrintStrings.Resolve(locale, PrintStringKey.EmptyOrder, payloadTranslations);
        var noteLabel = PrintStrings.Resolve(locale, PrintStringKey.OrderNote, payloadTranslations);

        ms.Write(Init());
        ms.Write(Align("center"));
        ms.Write(Bold(true));
        ms.Write(Encoding.UTF8.GetBytes(title));
        ms.WriteByte(LF);
        ms.Write(Bold(false));
        ms.Write(Encoding.UTF8.GetBytes(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")));
        ms.WriteByte(LF);
        ms.Write(Feed(1));

        ms.Write(Align("left"));
        if (items == null || items.Count == 0)
        {
            ms.Write(Encoding.UTF8.GetBytes(emptyLabel));
            ms.WriteByte(LF);
        }
        else
        {
            foreach (var it in items)
            {
                if (it == null) continue;
                ms.Write(Bold(true));
                var qty = it.Qty <= 0 ? 1 : it.Qty;
                var line = $"{(string.IsNullOrWhiteSpace(it.Course) ? "" : "[" + it.Course + "] ")}{qty}x {it.Name ?? ""}";
                ms.Write(Encoding.UTF8.GetBytes(line));
                ms.WriteByte(LF);
                ms.Write(Bold(false));
                if (!string.IsNullOrWhiteSpace(it.Notes))
                {
                    ms.Write(Encoding.UTF8.GetBytes("   - " + it.Notes));
                    ms.WriteByte(LF);
                }
            }
        }

        if (!string.IsNullOrWhiteSpace(orderNote))
        {
            ms.Write(Feed(1));
            ms.Write(Bold(true));
            ms.Write(Encoding.UTF8.GetBytes(noteLabel + ": " + orderNote));
            ms.WriteByte(LF);
            ms.Write(Bold(false));
        }

        ms.Write(Feed(2));
        ms.Write(Cut(false));
        return ms.ToArray();
    }

    /// <summary>Birden fazla parcayi birlestir.</summary>
    public static byte[] Concat(params byte[][] parts)
    {
        var total = 0;
        foreach (var p in parts) if (p != null) total += p.Length;
        var buf = new byte[total];
        var offset = 0;
        foreach (var p in parts)
        {
            if (p == null) continue;
            Buffer.BlockCopy(p, 0, buf, offset, p.Length);
            offset += p.Length;
        }
        return buf;
    }

    /// <summary>
    /// Hafif MemoryStream yerine basit liste-tabanli byte toplayici.
    /// Bu yardimci sinif EscPosBuilder icin ozel; MemoryStream yerine capacity churn onlemek icin.
    /// </summary>
    private sealed class MemoryStreamEquivalent
    {
        private byte[] _buf = new byte[256];
        private int _len;

        public void Write(byte[] src)
        {
            if (src == null || src.Length == 0) return;
            Ensure(src.Length);
            Buffer.BlockCopy(src, 0, _buf, _len, src.Length);
            _len += src.Length;
        }

        public void WriteByte(byte b)
        {
            Ensure(1);
            _buf[_len++] = b;
        }

        public byte[] ToArray()
        {
            var copy = new byte[_len];
            Buffer.BlockCopy(_buf, 0, copy, 0, _len);
            return copy;
        }

        private void Ensure(int extra)
        {
            var needed = _len + extra;
            if (needed <= _buf.Length) return;
            var newSize = _buf.Length;
            while (newSize < needed) newSize *= 2;
            Array.Resize(ref _buf, newSize);
        }
    }
}
