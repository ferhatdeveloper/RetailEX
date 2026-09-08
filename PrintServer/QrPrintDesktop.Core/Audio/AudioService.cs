using System.Media;
using QrPrintDesktop.Core.Config;

namespace QrPrintDesktop.Core.Audio;

public sealed class AudioService
{
    public void PlayWaiterCallSound(AppSettings settings)
    {
        PlaySound(settings.WaiterCallSoundFile);
    }

    public void PlayReceiptPrintSound(AppSettings settings)
    {
        PlaySound(settings.ReceiptPrintSoundFile);
    }

    private static void PlaySound(string relativeOrAbsolutePath)
    {
        try
        {
            var fullPath = Path.IsPathRooted(relativeOrAbsolutePath)
                ? relativeOrAbsolutePath
                : Path.Combine(AppContext.BaseDirectory, relativeOrAbsolutePath);

            if (File.Exists(fullPath))
            {
                using var player = new SoundPlayer(fullPath);
                player.Play();
                return;
            }
        }
        catch
        {
            // Fail silent and fallback to system beep.
        }

        SystemSounds.Beep.Play();
    }
}
