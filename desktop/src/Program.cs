using System;
using System.Threading;
using System.Windows.Forms;

namespace Wk87Remap
{
    internal static class Program
    {
        private const string MutexName = @"Local\WK87RemapSingle";
        private const string ShowSignalName = @"Local\WK87RemapShow";

        [STAThread]
        private static int Main(string[] args)
        {
            if (HasFlag(args, "--selftest"))
            {
                return SelfTest.Run();
            }

            bool firstInstance;
            Mutex mutex = new Mutex(true, MutexName, out firstInstance);

            if (!firstInstance)
            {
                bool signalled = false;
                try
                {
                    using (EventWaitHandle handle = EventWaitHandle.OpenExisting(ShowSignalName))
                    {
                        handle.Set();
                        signalled = true;
                    }
                }
                catch (Exception error)
                {
                    Log.Write("could not signal running instance: " + error.Message);
                }

                if (!signalled)
                {
                    MessageBox.Show(
                        "WK87 Remap is already running. Look for its icon in the notification area.",
                        "WK87 Remap",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }

                GC.KeepAlive(mutex);
                return 0;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += OnThreadException;
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

            string configDirectory = GetOption(args, "--config");
            if (configDirectory != null)
            {
                try
                {
                    SettingsStore.SetConfigDirectory(configDirectory);
                }
                catch (Exception error)
                {
                    MessageBox.Show(
                        "Could not use the folder passed to --config:" + Environment.NewLine +
                        configDirectory + Environment.NewLine + Environment.NewLine +
                        error.Message,
                        "WK87 Remap",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                    return 1;
                }
            }

            Log.Write("starting (arguments: " + (args.Length == 0 ? "none" : string.Join(" ", args)) + ")");

            EventWaitHandle showSignal = null;
            try
            {
                showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, ShowSignalName);

                bool startHidden = HasFlag(args, "--tray");
                using (TrayContext context = new TrayContext(LoadSettings(), showSignal, startHidden))
                {
                    showSignal = null;
                    Application.Run(context);
                }
            }
            catch (Exception error)
            {
                Log.Write("fatal: " + error);
                MessageBox.Show(
                    "WK87 Remap could not start." + Environment.NewLine + Environment.NewLine +
                    error.Message + Environment.NewLine + Environment.NewLine +
                    "Details were written to " + Log.LogPath,
                    "WK87 Remap",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                if (showSignal != null)
                {
                    showSignal.Dispose();
                }
                mutex.ReleaseMutex();
                mutex.Dispose();
            }

            Log.Write("stopped cleanly");
            return 0;
        }

        private static Settings LoadSettings()
        {
            Settings settings = SettingsStore.Load();
            if (settings.Remaps == null)
            {
                settings.Remaps = new System.Collections.Generic.List<RemapRule>();
            }
            return settings;
        }

        private static bool HasFlag(string[] args, string flag)
        {
            foreach (string argument in args)
            {
                if (string.Equals(argument, flag, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static string GetOption(string[] args, string name)
        {
            for (int index = 0; index < args.Length - 1; index++)
            {
                if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                {
                    return args[index + 1];
                }
            }
            return null;
        }

        private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
        {
            Log.Write("unhandled UI exception: " + e.Exception);
            MessageBox.Show(
                "WK87 Remap hit an unexpected error but is still running." + Environment.NewLine +
                Environment.NewLine + e.Exception.Message + Environment.NewLine + Environment.NewLine +
                "Details: " + Log.LogPath,
                "WK87 Remap",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            Log.Write("unhandled exception: " + e.ExceptionObject);
        }
    }
}
