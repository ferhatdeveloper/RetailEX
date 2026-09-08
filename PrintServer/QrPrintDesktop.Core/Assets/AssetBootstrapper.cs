using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Assets;

public sealed class AssetBootstrapper
{
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool DestroyIcon(IntPtr handle);

    public string EnsureAppIcon()
    {
        var assetsDir = Path.Combine(AppContext.BaseDirectory, "Assets");
        Directory.CreateDirectory(assetsDir);
        var iconPath = Path.Combine(assetsDir, "app.ico");
        if (File.Exists(iconPath))
        {
            return iconPath;
        }

        using var bmp = new Bitmap(64, 64);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.FromArgb(15, 23, 42));
            using var circleBrush = new SolidBrush(Color.FromArgb(59, 130, 246));
            g.FillEllipse(circleBrush, 6, 6, 52, 52);
            using var font = new Font("Segoe UI", 16, FontStyle.Bold, GraphicsUnit.Pixel);
            using var textBrush = new SolidBrush(Color.White);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("QR", font, textBrush, new RectangleF(0, 0, 64, 64), sf);
        }

        var iconHandle = bmp.GetHicon();
        try
        {
            using var icon = Icon.FromHandle(iconHandle);
            using var fs = File.Create(iconPath);
            icon.Save(fs);
        }
        finally
        {
            DestroyIcon(iconHandle);
        }

        return iconPath;
    }

    public void EnsureCustomSounds(AppSettings settings)
    {
        var waiterPath = Resolve(settings.WaiterCallSoundFile);
        var receiptPath = Resolve(settings.ReceiptPrintSoundFile);
        Directory.CreateDirectory(Path.GetDirectoryName(waiterPath)!);
        Directory.CreateDirectory(Path.GetDirectoryName(receiptPath)!);

        if (!File.Exists(waiterPath))
        {
            WriteToneWave(waiterPath, frequencyHz: 900, durationMs: 260, sampleRate: 22050, repeat: 2, gapMs: 90);
        }

        if (!File.Exists(receiptPath))
        {
            WriteToneWave(receiptPath, frequencyHz: 620, durationMs: 200, sampleRate: 22050, repeat: 1, gapMs: 0);
        }
    }

    private static string Resolve(string path)
    {
        return Path.IsPathRooted(path)
            ? path
            : Path.Combine(AppContext.BaseDirectory, path);
    }

    private static void WriteToneWave(string path, int frequencyHz, int durationMs, int sampleRate, int repeat, int gapMs)
    {
        var bitsPerSample = 16;
        var channels = 1;
        var bytesPerSample = bitsPerSample / 8;
        var samplesPerTone = sampleRate * durationMs / 1000;
        var samplesPerGap = sampleRate * gapMs / 1000;
        var totalSamples = repeat * (samplesPerTone + samplesPerGap);
        var dataSize = totalSamples * channels * bytesPerSample;

        using var fs = File.Create(path);
        using var bw = new BinaryWriter(fs);

        bw.Write("RIFF"u8.ToArray());
        bw.Write(36 + dataSize);
        bw.Write("WAVE"u8.ToArray());
        bw.Write("fmt "u8.ToArray());
        bw.Write(16);
        bw.Write((short)1);
        bw.Write((short)channels);
        bw.Write(sampleRate);
        bw.Write(sampleRate * channels * bytesPerSample);
        bw.Write((short)(channels * bytesPerSample));
        bw.Write((short)bitsPerSample);
        bw.Write("data"u8.ToArray());
        bw.Write(dataSize);

        for (var r = 0; r < repeat; r++)
        {
            for (var i = 0; i < samplesPerTone; i++)
            {
                var t = (double)i / sampleRate;
                var sample = (short)(Math.Sin(2 * Math.PI * frequencyHz * t) * short.MaxValue * 0.25);
                bw.Write(sample);
            }

            for (var i = 0; i < samplesPerGap; i++)
            {
                bw.Write((short)0);
            }
        }
    }
}
