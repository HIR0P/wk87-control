using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace Wk87Remap
{
    internal sealed class MainForm : Form
    {
        private static readonly Color Paper = Color.FromArgb(0xF7, 0xF3, 0xEC);
        private static readonly Color Card = Color.FromArgb(0xFF, 0xFD, 0xF9);
        private static readonly Color Ink = Color.FromArgb(0x2B, 0x27, 0x24);
        private static readonly Color Muted = Color.FromArgb(0x7A, 0x72, 0x68);
        private static readonly Color Accent = Color.FromArgb(0xB4, 0x55, 0x3C);

        private const int DesignWidth = 660;
        private const int DesignHeight = 640;

        private readonly TrayContext _app;
        private readonly double _scale;

        private CheckBox _winRescue;
        private CheckBox _gameMode;
        private CheckBox _startup;
        private NumericUpDown _panicSeconds;
        private ListBox _rules;
        private ComboBox _from;
        private ComboBox _to;
        private Button _captureFrom;
        private Button _captureTo;
        private Button _add;
        private Button _remove;
        private Label _emptyHint;
        private Label _status;
        private Label _warnings;

        private readonly Timer _captureTimer;
        private ComboBox _captureTarget;
        private Button _captureButton;
        private bool _loading;
        private bool _closeHintShown;
        private bool _exiting;

        public bool Exiting
        {
            get { return _exiting; }
            set { _exiting = value; }
        }

        public MainForm(TrayContext app)
        {
            _app = app;

            using (Graphics graphics = CreateGraphics())
            {
                _scale = graphics.DpiX / 96.0;
            }
            if (_scale < 0.75 || _scale > 4.0)
            {
                _scale = 1.0;
            }

            Text = "WK87 Remap";
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Paper;
            ForeColor = Ink;
            Font = new Font("Segoe UI", 9f);
            ClientSize = new Size(X(DesignWidth), X(DesignHeight));
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ShowIcon = true;
            DoubleBuffered = true;

            _captureTimer = new Timer();
            _captureTimer.Interval = 5000;
            _captureTimer.Tick += OnCaptureTimeout;

            BuildUi();

            FormClosing += OnFormClosing;
            _app.Hook.Captured += OnKeyCaptured;

            RefreshFromSettings();

            Log.Write("layout: client=" + ClientSize.Width + "x" + ClientSize.Height +
                      " scale=" + _scale.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) +
                      " font=" + Font.Height + "px");
        }

        private int X(int value)
        {
            return (int)Math.Round(value * _scale, MidpointRounding.AwayFromZero);
        }

        private Point P(int x, int y)
        {
            return new Point(X(x), X(y));
        }

        private Size Sz(int width, int height)
        {
            return new Size(X(width), X(height));
        }

        private void BuildUi()
        {
            Label title = new Label();
            title.Text = "WK87 Remap";
            title.Font = new Font("Segoe UI", 19f, FontStyle.Bold);
            title.ForeColor = Ink;
            title.AutoSize = true;
            title.Location = P(24, 12);
            Controls.Add(title);

            Label subtitle = new Label();
            subtitle.Text = "System-wide key remapping for the Weikav WK87. Runs in the tray and works in every app.";
            subtitle.ForeColor = Muted;
            subtitle.AutoSize = true;
            subtitle.Location = P(26, 52);
            Controls.Add(subtitle);

            Panel safety = MakeCard(24, 76, 612, 172);

            AddSectionLabel(safety, "SAFETY NET", 14, 10);

            _winRescue = MakeCheckBox("Caps Lock acts as the Windows key  (Win Rescue)", 14, 32, 570);
            _winRescue.CheckedChanged += OnWinRescueChanged;
            safety.Controls.Add(_winRescue);

            AddNote(safety,
                "Caps Lock is swapped before Windows sees it, so Win+E and friends work everywhere. " +
                "The Caps Lock LED still lights up, because that light belongs to the key itself.",
                32, 54, 560, 34);

            _gameMode = MakeCheckBox("Game Mode blocks the Windows keys  (Ctrl+Alt+G)", 14, 88, 570);
            _gameMode.CheckedChanged += OnGameModeChanged;
            safety.Controls.Add(_gameMode);

            AddNote(safety,
                "Handy in full-screen games. The hotkey works even while this window is hidden.",
                32, 110, 560, 18);

            Label panicCaption = new Label();
            panicCaption.Text = "Panic key";
            panicCaption.Font = new Font(Font, FontStyle.Bold);
            panicCaption.ForeColor = Ink;
            panicCaption.AutoSize = true;
            panicCaption.Location = P(14, 137);
            safety.Controls.Add(panicCaption);

            Label panicBefore = new Label();
            panicBefore.Text = "hold physical Esc for";
            panicBefore.ForeColor = Ink;
            panicBefore.AutoSize = true;
            panicBefore.Location = P(90, 137);
            safety.Controls.Add(panicBefore);

            _panicSeconds = new NumericUpDown();
            _panicSeconds.Minimum = 1;
            _panicSeconds.Maximum = 10;
            _panicSeconds.Value = 3;
            _panicSeconds.Location = P(236, 133);
            _panicSeconds.Size = Sz(56, 23);
            _panicSeconds.TextAlign = HorizontalAlignment.Center;
            _panicSeconds.ValueChanged += OnPanicChanged;
            safety.Controls.Add(_panicSeconds);

            Label panicAfter = new Label();
            panicAfter.Text = "seconds to pause all remapping.";
            panicAfter.ForeColor = Ink;
            panicAfter.AutoSize = false;
            panicAfter.Location = P(300, 137);
            panicAfter.Size = Sz(280, 18);
            safety.Controls.Add(panicAfter);

            Panel remaps = MakeCard(24, 256, 612, 252);

            AddSectionLabel(remaps, "PER-KEY REMAPS", 14, 10);

            _rules = new ListBox();
            _rules.Location = P(14, 32);
            _rules.Size = Sz(330, 150);
            _rules.BackColor = Color.White;
            _rules.ForeColor = Ink;
            _rules.BorderStyle = BorderStyle.FixedSingle;
            _rules.IntegralHeight = false;
            _rules.HorizontalScrollbar = false;
            _rules.SelectedIndexChanged += OnRuleSelected;
            remaps.Controls.Add(_rules);

            _emptyHint = new Label();
            _emptyHint.Text = "No remaps yet.\r\nAdd one on the right, or start with Win Rescue above.";
            _emptyHint.ForeColor = Muted;
            _emptyHint.BackColor = Color.White;
            _emptyHint.TextAlign = ContentAlignment.MiddleCenter;
            _emptyHint.AutoSize = false;
            _emptyHint.Location = P(15, 33);
            _emptyHint.Size = Sz(328, 148);
            remaps.Controls.Add(_emptyHint);
            _emptyHint.BringToFront();

            AddNote(remaps,
                "A rule swaps one physical key for another. \"Disable\" makes the key do nothing. " +
                "Games that read Raw Input directly can bypass Windows hooks.",
                14, 188, 330, 56);

            Label fromLabel = MakeFieldLabel("From", 356, 32);
            remaps.Controls.Add(fromLabel);

            _from = MakeKeyCombo(356, 50);
            remaps.Controls.Add(_from);

            _captureFrom = MakeSmallButton("Press", 548, 49);
            _captureFrom.Click += OnCaptureFromClicked;
            remaps.Controls.Add(_captureFrom);

            Label toLabel = MakeFieldLabel("To", 356, 84);
            remaps.Controls.Add(toLabel);

            _to = MakeKeyCombo(356, 102);
            remaps.Controls.Add(_to);

            _captureTo = MakeSmallButton("Press", 548, 101);
            _captureTo.Click += OnCaptureToClicked;
            remaps.Controls.Add(_captureTo);

            _add = MakeButton("Add rule", 356, 140, 96);
            _add.Click += OnAddClicked;
            remaps.Controls.Add(_add);

            _remove = MakeButton("Remove", 458, 140, 96);
            _remove.Enabled = false;
            _remove.Click += OnRemoveClicked;
            remaps.Controls.Add(_remove);

            AddNote(remaps,
                "Type a key name, or click Press and then hit the key. " +
                "Changes are saved and applied immediately.",
                356, 180, 240, 64);

            _startup = MakeCheckBox("Start with Windows (stays in the tray)", 26, 518, 340);
            _startup.BackColor = Paper;
            _startup.CheckedChanged += OnStartupChanged;
            Controls.Add(_startup);

            Button folder = new Button();
            folder.Text = "Open config folder";
            folder.Location = P(26, 544);
            folder.Size = Sz(150, 26);
            folder.FlatStyle = FlatStyle.Flat;
            folder.FlatAppearance.BorderSize = 0;
            folder.BackColor = Paper;
            folder.ForeColor = Accent;
            folder.TextAlign = ContentAlignment.MiddleLeft;
            folder.Cursor = Cursors.Hand;
            folder.Click += OnOpenFolderClicked;
            Controls.Add(folder);

            Button hide = MakeButton("Hide to tray", 512, 542, 124);
            hide.Click += OnHideClicked;
            Controls.Add(hide);

            _status = new Label();
            _status.Text = "Starting";
            _status.Font = new Font(Font, FontStyle.Bold);
            _status.ForeColor = Ink;
            _status.AutoSize = false;
            _status.Location = P(26, 578);
            _status.Size = Sz(610, 20);
            Controls.Add(_status);

            _warnings = new Label();
            _warnings.Text = "";
            _warnings.ForeColor = Accent;
            _warnings.AutoSize = false;
            _warnings.Location = P(26, 600);
            _warnings.Size = Sz(610, 34);
            _warnings.Visible = false;
            Controls.Add(_warnings);
        }

        private Panel MakeCard(int x, int y, int width, int height)
        {
            Panel panel = new Panel();
            panel.Location = P(x, y);
            panel.Size = Sz(width, height);
            panel.BackColor = Card;
            panel.BorderStyle = BorderStyle.FixedSingle;
            Controls.Add(panel);
            return panel;
        }

        private void AddSectionLabel(Control parent, string text, int x, int y)
        {
            Label label = new Label();
            label.Text = text;
            label.Font = new Font("Segoe UI", 8.25f, FontStyle.Bold);
            label.ForeColor = Accent;
            label.AutoSize = true;
            label.Location = P(x, y);
            parent.Controls.Add(label);
        }

        private void AddNote(Control parent, string text, int x, int y, int width, int height)
        {
            Label label = new Label();
            label.Text = text;
            label.ForeColor = Muted;
            label.AutoSize = false;
            label.Location = P(x, y);
            label.Size = Sz(width, height);
            parent.Controls.Add(label);
        }

        private CheckBox MakeCheckBox(string text, int x, int y, int width)
        {
            CheckBox box = new CheckBox();
            box.Text = text;
            box.AutoSize = false;
            box.Location = P(x, y);
            box.Size = Sz(width, 22);
            box.BackColor = Card;
            box.ForeColor = Ink;
            return box;
        }

        private Label MakeFieldLabel(string text, int x, int y)
        {
            Label label = new Label();
            label.Text = text;
            label.ForeColor = Muted;
            label.AutoSize = true;
            label.Location = P(x, y);
            return label;
        }

        private ComboBox MakeKeyCombo(int x, int y)
        {
            ComboBox combo = new ComboBox();
            combo.Location = P(x, y);
            combo.Size = Sz(186, 23);
            combo.DropDownStyle = ComboBoxStyle.DropDown;
            combo.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
            combo.AutoCompleteSource = AutoCompleteSource.ListItems;
            combo.Items.AddRange(KeyNames.PickerNames());
            return combo;
        }

        private Button MakeButton(string text, int x, int y, int width)
        {
            Button button = new Button();
            button.Text = text;
            button.Location = P(x, y);
            button.Size = Sz(width, 28);
            button.FlatStyle = FlatStyle.System;
            return button;
        }

        private Button MakeSmallButton(string text, int x, int y)
        {
            Button button = new Button();
            button.Text = text;
            button.Location = P(x, y);
            button.Size = Sz(50, 25);
            button.FlatStyle = FlatStyle.System;
            return button;
        }

        public void RefreshFromSettings()
        {
            _loading = true;
            try
            {
                Settings settings = _app.Settings;

                _winRescue.Checked = settings.WinRescue;
                _gameMode.Checked = settings.GameMode;
                _startup.Checked = _app.StartupEnabled();

                int seconds = settings.PanicHoldMs / 1000;
                if (seconds < 1)
                {
                    seconds = 1;
                }
                if (seconds > 10)
                {
                    seconds = 10;
                }
                _panicSeconds.Value = seconds;

                int selected = _rules.SelectedIndex;
                _rules.BeginUpdate();
                _rules.Items.Clear();
                foreach (RemapRule rule in settings.Remaps)
                {
                    int fromKey;
                    int toKey;
                    string fromName = KeyNames.TryParse(rule.From, out fromKey)
                        ? KeyNames.DisplayName(fromKey)
                        : rule.From;
                    string toName = KeyNames.TryParse(rule.To, out toKey)
                        ? KeyNames.DisplayName(toKey)
                        : rule.To;
                    _rules.Items.Add(fromName + "   ->   " + toName);
                }
                _rules.EndUpdate();

                if (selected >= 0 && selected < _rules.Items.Count)
                {
                    _rules.SelectedIndex = selected;
                }
                _remove.Enabled = _rules.SelectedIndex >= 0;
                _emptyHint.Visible = settings.Remaps.Count == 0;

                _status.Text = _app.StatusText();

                List<string> notes = new List<string>();
                foreach (string warning in _app.Warnings)
                {
                    notes.Add(warning);
                }
                if (!_app.HotkeyAvailable)
                {
                    notes.Add("Ctrl+Alt+G is owned by another app, so the Game Mode hotkey is off. Use the checkbox instead.");
                }

                if (notes.Count > 0)
                {
                    _warnings.Text = string.Join(Environment.NewLine, notes.ToArray());
                    _warnings.Visible = true;
                }
                else
                {
                    _warnings.Text = "";
                    _warnings.Visible = false;
                }
            }
            finally
            {
                _loading = false;
            }
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == Native.WM_HOTKEY &&
                message.WParam.ToInt32() == TrayContext.HotkeyId)
            {
                _app.ToggleGameMode();
                return;
            }
            base.WndProc(ref message);
        }

        private void OnWinRescueChanged(object sender, EventArgs e)
        {
            if (_loading)
            {
                return;
            }
            _app.Settings.WinRescue = _winRescue.Checked;
            _app.ApplySettings();
        }

        private void OnGameModeChanged(object sender, EventArgs e)
        {
            if (_loading)
            {
                return;
            }
            _app.SetGameMode(_gameMode.Checked);
        }

        private void OnPanicChanged(object sender, EventArgs e)
        {
            if (_loading)
            {
                return;
            }
            _app.Settings.PanicHoldMs = (int)_panicSeconds.Value * 1000;
            _app.ApplySettings();
        }

        private void OnStartupChanged(object sender, EventArgs e)
        {
            if (_loading)
            {
                return;
            }
            _app.SetStartup(_startup.Checked);
        }

        private void OnRuleSelected(object sender, EventArgs e)
        {
            if (_loading)
            {
                return;
            }

            int index = _rules.SelectedIndex;
            _remove.Enabled = index >= 0;
            if (index < 0 || index >= _app.Settings.Remaps.Count)
            {
                return;
            }

            RemapRule rule = _app.Settings.Remaps[index];
            int key;

            if (KeyNames.TryParse(rule.From, out key))
            {
                _from.Text = KeyNames.DisplayName(key);
            }
            else
            {
                _from.Text = rule.From;
            }

            if (KeyNames.TryParse(rule.To, out key))
            {
                _to.Text = KeyNames.DisplayName(key);
            }
            else
            {
                _to.Text = rule.To;
            }
        }

        private void OnAddClicked(object sender, EventArgs e)
        {
            int fromKey;
            int toKey;

            if (!KeyNames.TryParse(_from.Text, out fromKey) || fromKey == 0)
            {
                MessageBox.Show(
                    "Choose a real key in the From box. \"Disable\" can only be used as a target.",
                    "WK87 Remap",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            if (!KeyNames.TryParse(_to.Text, out toKey))
            {
                MessageBox.Show(
                    "Choose a target key in the To box, or type Disable to switch the key off.",
                    "WK87 Remap",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            if (fromKey == toKey)
            {
                MessageBox.Show(
                    "From and To are the same key, so this rule would do nothing.",
                    "WK87 Remap",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            RemapRule existing = null;
            foreach (RemapRule rule in _app.Settings.Remaps)
            {
                int ruleKey;
                if (KeyNames.TryParse(rule.From, out ruleKey) && ruleKey == fromKey)
                {
                    existing = rule;
                    break;
                }
            }

            if (existing != null)
            {
                existing.To = KeyNames.CanonicalName(toKey);
            }
            else
            {
                RemapRule rule = new RemapRule();
                rule.From = KeyNames.CanonicalName(fromKey);
                rule.To = KeyNames.CanonicalName(toKey);
                _app.Settings.Remaps.Add(rule);
            }

            _app.ApplySettings();

            for (int index = 0; index < _app.Settings.Remaps.Count; index++)
            {
                int ruleKey;
                if (KeyNames.TryParse(_app.Settings.Remaps[index].From, out ruleKey) &&
                    ruleKey == fromKey)
                {
                    _rules.SelectedIndex = index;
                    break;
                }
            }
        }

        private void OnRemoveClicked(object sender, EventArgs e)
        {
            int index = _rules.SelectedIndex;
            if (index < 0 || index >= _app.Settings.Remaps.Count)
            {
                return;
            }

            _app.Settings.Remaps.RemoveAt(index);
            _app.ApplySettings();
            if (_app.Settings.Remaps.Count > 0)
            {
                _rules.SelectedIndex = Math.Min(index, _app.Settings.Remaps.Count - 1);
            }
        }

        private void OnCaptureFromClicked(object sender, EventArgs e)
        {
            StartCapture(_from, _captureFrom);
        }

        private void OnCaptureToClicked(object sender, EventArgs e)
        {
            StartCapture(_to, _captureTo);
        }

        private void StartCapture(ComboBox target, Button button)
        {
            if (_captureTarget != null)
            {
                CancelCapture();
            }

            _captureTarget = target;
            _captureButton = button;
            button.Text = "Key...";
            _app.Hook.ArmCapture();
            _captureTimer.Start();
        }

        private void CancelCapture()
        {
            _app.Hook.DisarmCapture();
            _captureTimer.Stop();
            if (_captureButton != null)
            {
                _captureButton.Text = "Press";
            }
            _captureTarget = null;
            _captureButton = null;
        }

        private void OnCaptureTimeout(object sender, EventArgs e)
        {
            CancelCapture();
        }

        private void OnKeyCaptured(Keys key)
        {
            _captureTimer.Stop();
            ComboBox target = _captureTarget;
            Button button = _captureButton;
            _captureTarget = null;
            _captureButton = null;

            if (button != null)
            {
                button.Text = "Press";
            }
            if (target != null)
            {
                target.Text = KeyNames.DisplayName((int)key & 0xFF);
            }
        }

        private void OnOpenFolderClicked(object sender, EventArgs e)
        {
            _app.OpenConfigFolder();
        }

        private void OnHideClicked(object sender, EventArgs e)
        {
            Hide();
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (_app.Exiting)
            {
                return;
            }

            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                CancelCapture();
                Hide();
                if (!_closeHintShown)
                {
                    _closeHintShown = true;
                    _app.Notify(
                        "Still running",
                        "WK87 Remap keeps working in the tray. Right-click the tray icon to pause or exit.",
                        ToolTipIcon.Info);
                }
            }
        }
    }
}
