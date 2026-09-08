namespace QrPrintDesktop.Core.Windows;

/// <summary>
/// FastReport / PrintDocument yazıcı adını yalnızca UI (STA + mesaj döngüsü) üzerinde
/// güvenilir uygular. Timer poll ConfigureAwait(false) ile thread-pool'a düşünce
/// varsayılan yazıcıya basılıyordu; sipariş ekranı Yazdır ise UI'da kaldığı için doğruydu.
/// </summary>
public static class UiPrintDispatcher
{
    private static SynchronizationContext? _ui;

    public static void Capture()
    {
        var current = SynchronizationContext.Current;
        if (current is not null)
        {
            _ui = current;
        }
    }

    public static bool HasUiContext => _ui is not null;

    public static bool Run(Func<bool> action)
    {
        if (action is null)
        {
            throw new ArgumentNullException(nameof(action));
        }

        if (_ui is not null)
        {
            return InvokeOnUi(_ui, action);
        }

        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA)
        {
            return action();
        }

        return RunOnBackgroundSta(action);
    }

    private static bool InvokeOnUi(SynchronizationContext ui, Func<bool> action)
    {
        if (ReferenceEquals(SynchronizationContext.Current, ui) &&
            Thread.CurrentThread.GetApartmentState() == ApartmentState.STA)
        {
            return action();
        }

        var result = false;
        Exception? error = null;
        ui.Send(_ =>
        {
            try
            {
                result = action();
            }
            catch (Exception ex)
            {
                error = ex;
            }
        }, null);

        if (error is not null)
        {
            throw error;
        }

        return result;
    }

    private static bool RunOnBackgroundSta(Func<bool> action)
    {
        var result = false;
        Exception? error = null;
        var thread = new Thread(() =>
        {
            try
            {
                result = action();
            }
            catch (Exception ex)
            {
                error = ex;
            }
        })
        {
            IsBackground = true,
            Name = "RetailEX-Print"
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error is not null)
        {
            throw error;
        }

        return result;
    }
}
