using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Wk87Remap
{
    internal static class AppIcon
    {
        public static Icon Create(bool paused)
        {
            using (Bitmap bitmap = new Bitmap(32, 32))
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.TextRenderingHint = TextRenderingHint.AntiAlias;
                graphics.Clear(Color.Transparent);

                Color fill = paused
                    ? Color.FromArgb(0x8C, 0x83, 0x78)
                    : Color.FromArgb(0xB4, 0x55, 0x3C);

                using (GraphicsPath path = RoundedRect(new RectangleF(1.5f, 1.5f, 29f, 29f), 6f))
                using (SolidBrush brush = new SolidBrush(fill))
                {
                    graphics.FillPath(brush, path);
                }

                using (Pen pen = new Pen(Color.FromArgb(80, 255, 255, 255), 1.4f))
                using (GraphicsPath inner = RoundedRect(new RectangleF(5.5f, 5.5f, 21f, 21f), 4f))
                {
                    graphics.DrawPath(pen, inner);
                }

                using (Font font = new Font("Segoe UI", 11.5f, FontStyle.Bold, GraphicsUnit.Pixel))
                using (SolidBrush text = new SolidBrush(Color.White))
                using (StringFormat format = new StringFormat())
                {
                    format.Alignment = StringAlignment.Center;
                    format.LineAlignment = StringAlignment.Center;
                    graphics.DrawString("W", font, text, new RectangleF(0f, 0f, 32f, 33f), format);
                }

                IntPtr handle = bitmap.GetHicon();
                try
                {
                    using (Icon temporary = Icon.FromHandle(handle))
                    {
                        return (Icon)temporary.Clone();
                    }
                }
                finally
                {
                    Native.DestroyIcon(handle);
                }
            }
        }

        private static GraphicsPath RoundedRect(RectangleF bounds, float radius)
        {
            GraphicsPath path = new GraphicsPath();
            float diameter = radius * 2f;
            path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180f, 90f);
            path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270f, 90f);
            path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0f, 90f);
            path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90f, 90f);
            path.CloseFigure();
            return path;
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        public const int HotkeyId = 0xB87;

        private readonly MainForm _form;
        private readonly HookEngine _hook;
        private readonly NotifyIcon _tray;
        private readonly Icon _iconActive;
        private readonly Icon _iconPaused;

        private readonly ToolStripMenuItem _openItem;
        private readonly ToolStripMenuItem _statusItem;
        private readonly ToolStripMenuItem _pauseItem;
        private readonly ToolStripMenuItem _gameItem;
        private readonly ToolStripMenuItem _startupItem;

        private readonly EventWaitHandle _showSignal;
        private readonly List<string> _warnings = new List<string>();

        private readonly Settings _settings;
        private bool _hotkeyRegistered;
        private bool _exiting;

        public TrayContext(Settings settings, EventWaitHandle showSignal, bool startHidden)
        {
            _settings = settings;
            _showSignal = showSignal;

            _hook = new HookEngine();
            _hook.PanicHoldMs = settings.PanicHoldMs;
            _hook.GameMode = settings.GameMode;
            _hook.PanicTriggered += OnPanicTriggered;
            ApplyMap();

            _form = new MainForm(this);
            _form.Exiting = false;
            IntPtr unused = _form.Handle;

            _iconActive = AppIcon.Create(false);
            _iconPaused = AppIcon.Create(true);
            _form.Icon = _iconActive;

            _openItem = new ToolStripMenuItem("Open settings", null, OnOpenClicked);
            _openItem.Font = new Font(_openItem.Font, FontStyle.Bold);

            _statusItem = new ToolStripMenuItem("Status: starting");
            _statusItem.Enabled = false;

            _pauseItem = new ToolStripMenuItem("Remapping enabled");
            _pauseItem.CheckOnClick = false;
            _pauseItem.Click += OnPauseClicked;

            _gameItem = new ToolStripMenuItem("Game Mode  (Ctrl+Alt+G)");
            _gameItem.Click += OnGameClicked;

            _startupItem = new ToolStripMenuItem("Start with Windows");
            _startupItem.Click += OnStartupClicked;

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add(_openItem);
            menu.Items.Add(_statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_pauseItem);
            menu.Items.Add(_gameItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(_startupItem);
            menu.Items.Add(new ToolStripMenuItem("Open config folder", null, OnOpenFolderClicked));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem("Exit", null, OnExitClicked));
            menu.Opening += OnMenuOpening;

            _tray = new NotifyIcon();
            _tray.ContextMenuStrip = menu;
            _tray.DoubleClick += OnOpenClicked;
            _tray.Visible = true;

            try
            {
                _hook.Start();
            }
            catch (Exception error)
            {
                Log.Write("startup failed: " + error);
                _tray.Visible = false;
                _tray.Dispose();
                throw;
            }

            _hotkeyRegistered = Native.RegisterHotKey(
                _form.Handle,
                HotkeyId,
                Native.MOD_CONTROL | Native.MOD_ALT | Native.MOD_NOREPEAT,
                (uint)Keys.G);
            if (!_hotkeyRegistered)
            {
                Log.Write("hotkey Ctrl+Alt+G was refused; another app owns it");
            }

            UpdateState();

            if (showSignal != null)
            {
                Thread watcher = new Thread(WatchShowSignal);
                watcher.IsBackground = true;
                watcher.Name = "WK87 show signal";
                watcher.Start();
            }

            if (!startHidden)
            {
                ShowSettings();
            }
        }

        public Settings Settings
        {
            get { return _settings; }
        }

        public HookEngine Hook
        {
            get { return _hook; }
        }

        public IList<string> Warnings
        {
            get { return _warnings; }
        }

        public bool Exiting
        {
            get { return _exiting; }
            set { _exiting = value; }
        }

        public bool Paused
        {
            get { return _hook.Paused; }
        }

        public bool GameMode
        {
            get { return _hook.GameMode; }
        }

        public bool HotkeyAvailable
        {
            get { return _hotkeyRegistered; }
        }

        public void ApplySettings()
        {
            ApplyMap();
            SettingsStore.Save(_settings);
            UpdateState();
        }

        private void ApplyMap()
        {
            _warnings.Clear();
            Dictionary<int, int> map = SettingsStore.BuildMap(_settings, _warnings);
            _hook.SetMap(map);
            _hook.GameMode = _settings.GameMode;
            _hook.PanicHoldMs = _settings.PanicHoldMs;

            if (_settings.GameMode && _settings.WinRescue)
            {
                _warnings.Add("Game Mode blocks the Windows key, so Win Rescue has no effect while it is on.");
            }
        }

        public void SetPaused(bool paused, bool announce)
        {
            if (_hook.Paused == paused)
            {
                return;
            }

            _hook.Paused = paused;
            if (announce)
            {
                if (paused)
                {
                    Notify(
                        "Remapping paused",
                        "Your keys are back to normal. Turn remapping on again from the tray.",
                        ToolTipIcon.Info);
                }
                else
                {
                    Notify("Remapping active", Rules() + " are live again.", ToolTipIcon.Info);
                }
            }
            UpdateState();
        }

        public void SetGameMode(bool enabled)
        {
            if (_settings.GameMode == enabled)
            {
                return;
            }

            _settings.GameMode = enabled;
            ApplySettings();

            if (enabled)
            {
                Notify(
                    "Game Mode on",
                    "The Windows keys are blocked. Press Ctrl+Alt+G to turn Game Mode off.",
                    ToolTipIcon.Info);
            }
            else
            {
                Notify("Game Mode off", "The Windows keys work normally again.", ToolTipIcon.Info);
            }
        }

        public void ToggleGameMode()
        {
            SetGameMode(!_settings.GameMode);
        }

        public bool StartupEnabled()
        {
            return Startup.IsEnabled();
        }

        public bool SetStartup(bool enabled)
        {
            bool ok = Startup.SetEnabled(enabled);
            if (!ok)
            {
                MessageBox.Show(
                    "Windows did not accept the autostart change. Check log.txt in the config folder.",
                    "WK87 Remap",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
            UpdateState();
            return ok;
        }

        public void OpenConfigFolder()
        {
            try
            {
                Directory.CreateDirectory(SettingsStore.ConfigDirectory);
                Process.Start("explorer.exe", "\"" + SettingsStore.ConfigDirectory + "\"");
            }
            catch (Exception error)
            {
                Log.Write("could not open config folder: " + error.Message);
                MessageBox.Show(
                    "Could not open " + SettingsStore.ConfigDirectory,
                    "WK87 Remap",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        public void ShowSettings()
        {
            if (_exiting)
            {
                return;
            }

            _form.Show();
            if (_form.WindowState == FormWindowState.Minimized)
            {
                _form.WindowState = FormWindowState.Normal;
            }
            _form.Activate();
            _form.BringToFront();
        }

        public void Notify(string title, string text, ToolTipIcon icon)
        {
            try
            {
                _tray.ShowBalloonTip(4000, title, text, icon);
            }
            catch (Exception error)
            {
                Log.Write("balloon failed: " + error.Message);
            }
        }

        public string StatusText()
        {
            string state = _hook.Paused ? "Paused" : "Active";
            string mode = _settings.GameMode ? "Game Mode on" : "Game Mode off";
            string rescue = _settings.WinRescue ? "Win Rescue on" : "Win Rescue off";

            if (_warnings.Count > 0)
            {
                return state + " - check the notes below";
            }
            return state + " - " + Rules() + " - " + rescue + " - " + mode;
        }

        private string Rules()
        {
            int count = _settings.Remaps.Count;
            if (count == 1)
            {
                return "1 remap";
            }
            return count + " remaps";
        }

        public void UpdateState()
        {
            bool paused = _hook.Paused;
            _tray.Icon = paused ? _iconPaused : _iconActive;

            string tip = "WK87 Remap - " + (paused ? "paused" : "active");
            if (_settings.GameMode && !paused)
            {
                tip += " - game mode";
            }
            if (!paused && _settings.Remaps.Count > 0)
            {
                tip += " - " + Rules();
            }
            if (tip.Length > 63)
            {
                tip = tip.Substring(0, 63);
            }
            _tray.Text = tip;
            _statusItem.Text = "Status: " + StatusText();

            _pauseItem.Checked = !paused;
            _gameItem.Checked = _settings.GameMode;

            if (!_form.IsDisposed)
            {
                _form.RefreshFromSettings();
            }
        }

        public void RequestExit()
        {
            if (_exiting)
            {
                return;
            }

            Log.Write("exit requested");
            _exiting = true;

            if (_hotkeyRegistered && _form.IsHandleCreated)
            {
                Native.UnregisterHotKey(_form.Handle, HotkeyId);
            }

            _hook.Dispose();

            _tray.Visible = false;
            _tray.Dispose();

            if (_showSignal != null)
            {
                try
                {
                    _showSignal.Set();
                }
                catch (Exception)
                {
                    // Closing anyway.
                }
            }

            if (!_form.IsDisposed)
            {
                _form.Exiting = true;
                _form.Close();
                _form.Dispose();
            }

            _iconActive.Dispose();
            _iconPaused.Dispose();
            ExitThread();
        }

        private void OnPanicTriggered(object sender, EventArgs e)
        {
            Log.Write("panic hold fired");
            Notify(
                "Remapping paused",
                "You held Esc for " + (_settings.PanicHoldMs / 1000) +
                " seconds. All remaps are off until you turn them back on.",
                ToolTipIcon.Warning);
            UpdateState();
        }

        private void OnOpenClicked(object sender, EventArgs e)
        {
            ShowSettings();
        }

        private void OnPauseClicked(object sender, EventArgs e)
        {
            SetPaused(!_hook.Paused, true);
        }

        private void OnGameClicked(object sender, EventArgs e)
        {
            ToggleGameMode();
        }

        private void OnStartupClicked(object sender, EventArgs e)
        {
            SetStartup(!Startup.IsEnabled());
        }

        private void OnOpenFolderClicked(object sender, EventArgs e)
        {
            OpenConfigFolder();
        }

        private void OnExitClicked(object sender, EventArgs e)
        {
            RequestExit();
        }

        private void OnMenuOpening(object sender, CancelEventArgs e)
        {
            _startupItem.Checked = Startup.IsEnabled();
            _pauseItem.Checked = !_hook.Paused;
            _gameItem.Checked = _settings.GameMode;
            _statusItem.Text = "Status: " + StatusText();
        }

        private void WatchShowSignal()
        {
            try
            {
                while (!_exiting)
                {
                    _showSignal.WaitOne();
                    if (_exiting)
                    {
                        return;
                    }

                    try
                    {
                        _form.BeginInvoke((MethodInvoker)delegate { ShowSettings(); });
                    }
                    catch (Exception)
                    {
                        return;
                    }
                }
            }
            catch (Exception error)
            {
                Log.Write("show signal watcher stopped: " + error.Message);
            }
        }
    }
}
