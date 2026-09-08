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
        var packaged = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (File.Exists(packaged))
        {
            return packaged;
        }

        var dataPath = Path.Combine(SettingsService.DefaultDirectory, "Assets", "app.ico");
        if (File.Exists(dataPath))
        {
            return dataPath;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(dataPath)!);
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
                using var fs = File.Create(dataPath);
                icon.Save(fs);
            }
            finally
            {
                DestroyIcon(iconHandle);
            }

            return dataPath;
        }
        catch
        {
            return packaged;
        }
    }

    public void EnsureCustomSounds(AppSettings settings)
    {
        settings.WaiterCallSoundFile = EnsureTone(
            settings.WaiterCallSoundFile,
            "waiter-call.wav",
            frequencyHz: 900,
            durationMs: 260,
            repeat: 2,
            gapMs: 90);
        settings.ReceiptPrintSoundFile = EnsureTone(
            settings.ReceiptPrintSoundFile,
            "receipt-print.wav",
            frequencyHz: 620,
            durationMs: 200,
            repeat: 1,
            gapMs: 0);
    }

    public static string ResolveExistingSound(string? relativeOrAbsolutePath)
    {
        foreach (var candidate in SoundCandidates(relativeOrAbsolutePath, "waiter-call.wav"))
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        foreach (var candidate in SoundCandidates(relativeOrAbsolutePath, Path.GetFileName(relativeOrAbsolutePath ?? "")))
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return string.Empty;
    }

    private static string EnsureTone(string configured, string fileName, int frequencyHz, int durationMs, int repeat, int gapMs)
    {
        foreach (var candidate in SoundCandidates(configured, fileName))
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        var dest = Path.Combine(SettingsService.DefaultDirectory, "Sounds", fileName);
        if (IsProtectedInstallPath(dest))
        {
            return dest;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            WriteToneWave(dest, frequencyHz, durationMs, sampleRate: 22050, repeat, gapMs);
            return dest;
        }
        catch
        {
            return dest;
        }
    }

    private static IEnumerable<string> SoundCandidates(string? configured, string fileName)
    {
        var name = string.IsNullOrWhiteSpace(fileName) ? "sound.wav" : fileName;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            if (Path.IsPathRooted(configured))
            {
                yield return configured;
            }
            else
            {
                yield return Path.Combine(AppContext.BaseDirectory, configured);
                yield return Path.Combine(SettingsService.DefaultDirectory, configured);
            }
        }

        yield return Path.Combine(AppContext.BaseDirectory, "Sounds", name);
        yield return Path.Combine(SettingsService.DefaultDirectory, "Sounds", name);
    }

    private static bool IsProtectedInstallPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return true;
        }

        try
        {
            var full = Path.GetFullPath(path);
            foreach (var root in new[]
                     {
                         Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                         Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                         Environment.GetFolderPath(Environment.SpecialFolder.Windows)
                     })
            {
                if (string.IsNullOrWhiteSpace(root))
                {
                    continue;
                }

                var prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                    + Path.DirectorySeparatorChar;
                if (full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }
        catch
        {
            return true;
        }

        return false;
    }

    private static void WriteToneWave(string path, int frequencyHz, int durationMs, int sampleRate, int repeat, int gapMs)
    {
        if (IsProtectedInstallPath(path))
        {
            return;
        }

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
