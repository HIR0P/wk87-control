using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Windows.Forms;

namespace Wk87Remap
{
    [DataContract]
    public sealed class RemapRule
    {
        [DataMember(Name = "from", Order = 0)]
        public string From = "";

        [DataMember(Name = "to", Order = 1)]
        public string To = "";
    }

    [DataContract]
    public sealed class Settings
    {
        [DataMember(Name = "winRescue", Order = 0)]
        public bool WinRescue;

        [DataMember(Name = "gameMode", Order = 1)]
        public bool GameMode;

        [DataMember(Name = "panicHoldMs", Order = 2)]
        public int PanicHoldMs = 3000;

        [DataMember(Name = "remaps", Order = 3)]
        public List<RemapRule> Remaps = new List<RemapRule>();

        public Settings Clone()
        {
            Settings copy = new Settings();
            copy.WinRescue = WinRescue;
            copy.GameMode = GameMode;
            copy.PanicHoldMs = PanicHoldMs;
            copy.Remaps = new List<RemapRule>();
            foreach (RemapRule rule in Remaps)
            {
                RemapRule item = new RemapRule();
                item.From = rule.From;
                item.To = rule.To;
                copy.Remaps.Add(item);
            }
            return copy;
        }
    }

    public static class SettingsStore
    {
        public const string AppName = "WK87 Remap";

        private static string _overrideDirectory;

        /// <summary>
        /// Point the app somewhere other than %APPDATA%\WK87 Control.
        /// Used by --config for portable or test runs.
        /// </summary>
        public static void SetConfigDirectory(string directory)
        {
            if (string.IsNullOrEmpty(directory))
            {
                return;
            }

            string full = Path.GetFullPath(directory);
            _overrideDirectory = full;
            Directory.CreateDirectory(full);
            Log.Write("config directory overridden to " + full);
        }

        public static bool IsOverridden
        {
            get { return _overrideDirectory != null; }
        }

        public static string ConfigDirectory
        {            get
            {
                if (_overrideDirectory != null)
                {
                    return _overrideDirectory;
                }
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "WK87 Control");
            }
        }

        public static string ConfigPath
        {
            get { return Path.Combine(ConfigDirectory, "config.json"); }
        }

        public static Settings Load()
        {
            return LoadFrom(ConfigPath);
        }

        public static Settings LoadFrom(string path)
        {
            try
            {
                if (!File.Exists(path))
                {
                    return new Settings();
                }

                using (FileStream stream = File.OpenRead(path))
                {
                    DataContractJsonSerializer serializer =
                        new DataContractJsonSerializer(typeof(Settings));
                    Settings loaded = serializer.ReadObject(stream) as Settings;
                    if (loaded == null)
                    {
                        return new Settings();
                    }
                    if (loaded.Remaps == null)
                    {
                        loaded.Remaps = new List<RemapRule>();
                    }
                    if (loaded.PanicHoldMs < 500 || loaded.PanicHoldMs > 10000)
                    {
                        loaded.PanicHoldMs = 3000;
                    }
                    return loaded;
                }
            }
            catch (Exception error)
            {
                Log.Write("could not read config: " + error.Message);
                return new Settings();
            }
        }

        public static bool Save(Settings settings)
        {
            return SaveTo(ConfigPath, settings);
        }

        public static bool SaveTo(string path, Settings settings)
        {
            try
            {
                string directory = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                StringBuilder json = new StringBuilder();
                json.AppendLine("{");
                json.AppendLine("  \"winRescue\": " + (settings.WinRescue ? "true" : "false") + ",");
                json.AppendLine("  \"gameMode\": " + (settings.GameMode ? "true" : "false") + ",");
                json.AppendLine("  \"panicHoldMs\": " + settings.PanicHoldMs.ToString(CultureInfo.InvariantCulture) + ",");
                json.AppendLine("  \"remaps\": [");
                for (int index = 0; index < settings.Remaps.Count; index++)
                {
                    RemapRule rule = settings.Remaps[index];
                    json.Append("    { \"from\": \"" + Escape(rule.From) + "\", \"to\": \"" + Escape(rule.To) + "\" }");
                    if (index < settings.Remaps.Count - 1)
                    {
                        json.Append(",");
                    }
                    json.AppendLine();
                }
                json.AppendLine("  ]");
                json.AppendLine("}");

                File.WriteAllText(path, json.ToString(), new UTF8Encoding(false));
                return true;
            }
            catch (Exception error)
            {
                Log.Write("could not save config: " + error.Message);
                return false;
            }
        }

        /// <summary>Compose the active map: explicit remaps first, Win Rescue last.</summary>
        public static Dictionary<int, int> BuildMap(Settings settings, List<string> warnings)
        {
            Dictionary<int, int> map = new Dictionary<int, int>();

            if (settings.Remaps != null)
            {
                foreach (RemapRule rule in settings.Remaps)
                {
                    int from;
                    int to;
                    if (!KeyNames.TryParse(rule.From, out from) || from == 0)
                    {
                        warnings.Add("Unknown source key: " + (rule.From ?? ""));
                        continue;
                    }
                    if (!KeyNames.TryParse(rule.To, out to))
                    {
                        warnings.Add("Unknown target key: " + (rule.To ?? ""));
                        continue;
                    }
                    map[from] = to;
                }
            }

            if (settings.WinRescue && !map.ContainsKey((int)Keys.CapsLock))
            {
                map[(int)Keys.CapsLock] = (int)Keys.LWin;
            }

            return map;
        }

        private static string Escape(string value)
        {
            if (value == null)
            {
                return "";
            }
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }

    /// <summary>
    /// Turns the names used in config.json into virtual-key codes. Accepts any
    /// Keys enum name (CapsLock, LWin, F13, PageDown...), a few friendly aliases,
    /// hexadecimal codes like 0x5B, and the literal "Disable".
    /// </summary>
    public static class KeyNames
    {
        private static readonly Dictionary<string, string> Aliases =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "Win", "LWin" },
                { "Windows", "LWin" },
                { "Esc", "Escape" },
                { "Return", "Enter" },
                { "Ctrl", "LControlKey" },
                { "Control", "LControlKey" },
                { "Alt", "LMenu" },
                { "Shift", "LShiftKey" },
                { "Caps", "CapsLock" },
                { "Menu", "Apps" },
                { "Del", "Delete" },
                { "Grave", "Oemtilde" },
                { "Backquote", "Oemtilde" },
                { "Backtick", "Oemtilde" },
                { "Tilde", "Oemtilde" }
            };

        private static readonly Dictionary<int, string> Display =
            new Dictionary<int, string>
            {
                { 0x08, "Backspace" },
                { 0x09, "Tab" },
                { 0x0D, "Enter" },
                { 0x13, "Pause" },
                { 0x14, "Caps Lock" },
                { 0x1B, "Esc" },
                { 0x20, "Space" },
                { 0x10, "Shift" },
                { 0x11, "Ctrl" },
                { 0x12, "Alt" },
                { 0x5B, "Win" },
                { 0x5C, "Right Win" },
                { 0x5D, "Menu" },
                { 0x2C, "Print Screen" },
                { 0x91, "Scroll Lock" },
                { 0x90, "Num Lock" },
                { 0x2D, "Insert" },
                { 0x2E, "Delete" },
                { 0x24, "Home" },
                { 0x23, "End" },
                { 0x21, "Page Up" },
                { 0x22, "Page Down" },
                { 0x25, "Left" },
                { 0x26, "Up" },
                { 0x27, "Right" },
                { 0x28, "Down" },
                { 0xA0, "Left Shift" },
                { 0xA1, "Right Shift" },
                { 0xA2, "Left Ctrl" },
                { 0xA3, "Right Ctrl" },
                { 0xA4, "Left Alt" },
                { 0xA5, "Right Alt" },
                { 0x6A, "Num *" },
                { 0x6B, "Num +" },
                { 0x6D, "Num -" },
                { 0x6E, "Num ." },
                { 0x6F, "Num /" },
                { 0xBA, ";" },
                { 0xBB, "=" },
                { 0xBC, "," },
                { 0xBD, "-" },
                { 0xBE, "." },
                { 0xBF, "/" },
                { 0xC0, "`" },
                { 0xDB, "[" },
                { 0xDC, "\\" },
                { 0xDD, "]" },
                { 0xDE, "'" }
            };

        private static readonly Dictionary<string, int> DisplayLookup =
            new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        static KeyNames()
        {
            for (int index = 0; index <= 9; index++)
            {
                Display[0x30 + index] = index.ToString(CultureInfo.InvariantCulture);
            }
            for (int index = 0; index <= 9; index++)
            {
                Display[0x60 + index] = "Num " + index.ToString(CultureInfo.InvariantCulture);
            }

            foreach (KeyValuePair<int, string> pair in Display)
            {
                DisplayLookup[Normalize(pair.Value)] = pair.Key;
            }
        }

        private static string Normalize(string value)
        {
            return value.Replace(" ", "").Replace("-", "").Trim();
        }

        private static readonly Dictionary<int, string> CanonicalOverrides =
            new Dictionary<int, string>
            {
                { 0x0D, "Enter" },
                { 0x14, "CapsLock" }
            };

        /// <summary>Name stored in config.json; always a stable Keys enum name.</summary>
        public static string CanonicalName(int virtualKey)
        {
            if (virtualKey == 0)
            {
                return "Disable";
            }

            string overrideName;
            if (CanonicalOverrides.TryGetValue(virtualKey, out overrideName))
            {
                return overrideName;
            }

            return ((Keys)virtualKey).ToString();
        }

        /// <summary>Human readable name for the picker and the rule list.</summary>
        public static string DisplayName(int virtualKey)
        {
            if (virtualKey == 0)
            {
                return "Disable";
            }
            string name;
            if (Display.TryGetValue(virtualKey, out name))
            {
                return name;
            }
            return CanonicalName(virtualKey);
        }

        public static bool TryParse(string name, out int virtualKey)
        {
            virtualKey = 0;
            if (name == null)
            {
                return false;
            }

            string value = name.Trim();
            if (value.Length == 0)
            {
                return false;
            }

            if (value.Equals("Disable", StringComparison.OrdinalIgnoreCase) ||
                value.Equals("None", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (value.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            {
                int parsed;
                if (int.TryParse(value.Substring(2), NumberStyles.HexNumber,
                        CultureInfo.InvariantCulture, out parsed) &&
                    parsed > 0 && parsed <= 0xFF)
                {
                    virtualKey = parsed;
                    return true;
                }
                return false;
            }

            if (value.Length == 1 && value[0] >= '0' && value[0] <= '9')
            {
                virtualKey = 0x30 + (value[0] - '0');
                return true;
            }

            int displayMatch;
            if (DisplayLookup.TryGetValue(Normalize(value), out displayMatch))
            {
                virtualKey = displayMatch;
                return true;
            }

            string alias;
            if (Aliases.TryGetValue(value, out alias))
            {
                value = alias;
            }

            Keys key;
            if (!Enum.TryParse<Keys>(value, true, out key))
            {
                return false;
            }

            int code = ((int)key) & 0xFFFF;
            if (((int)key) > 0xFFFF || code == 0)
            {
                return false;
            }

            virtualKey = code;
            return true;
        }

        /// <summary>Keys offered in the picker, roughly in keyboard order.</summary>
        public static string[] PickerNames()
        {
            List<string> names = new List<string>();
            for (int vk = 0x41; vk <= 0x5A; vk++)
            {
                names.Add(DisplayName(vk));
            }
            for (int vk = 0x30; vk <= 0x39; vk++)
            {
                names.Add(DisplayName(vk));
            }
            for (int vk = 0x70; vk <= 0x7B; vk++)
            {
                names.Add(CanonicalName(vk));
            }
            names.Add("Esc");
            names.Add("Tab");
            names.Add("Caps Lock");
            names.Add("Left Shift");
            names.Add("Left Ctrl");
            names.Add("Left Alt");
            names.Add("Win");
            names.Add("Space");
            names.Add("Backspace");
            names.Add("Enter");
            names.Add("Insert");
            names.Add("Delete");
            names.Add("Home");
            names.Add("End");
            names.Add("Page Up");
            names.Add("Page Down");
            names.Add("Up");
            names.Add("Down");
            names.Add("Left");
            names.Add("Right");
            names.Add("Menu");
            names.Add("Print Screen");
            names.Add("Scroll Lock");
            names.Add("Pause");
            names.Add("Num Lock");
            names.Add("Disable");
            return names.ToArray();
        }
    }

    public static class Log
    {
        private static readonly object Sync = new object();

        public static string LogPath
        {
            get { return Path.Combine(SettingsStore.ConfigDirectory, "log.txt"); }
        }

        public static void Write(string message)
        {
            try
            {
                lock (Sync)
                {
                    Directory.CreateDirectory(SettingsStore.ConfigDirectory);
                    File.AppendAllText(
                        LogPath,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) +
                        "  " + message + Environment.NewLine,
                        new UTF8Encoding(false));
                }
            }
            catch
            {
                // Logging must never take the app down.
            }
        }
    }

    public static class Startup
    {
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

        public static bool IsEnabled()
        {
            try
            {
                using (Microsoft.Win32.RegistryKey key =
                    Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKeyPath, false))
                {
                    return key != null && key.GetValue(SettingsStore.AppName) != null;
                }
            }
            catch (Exception error)
            {
                Log.Write("could not read autostart: " + error.Message);
                return false;
            }
        }

        public static bool SetEnabled(bool enabled)
        {
            try
            {
                using (Microsoft.Win32.RegistryKey key =
                    Microsoft.Win32.Registry.CurrentUser.CreateSubKey(RunKeyPath))
                {
                    if (key == null)
                    {
                        return false;
                    }
                    if (enabled)
                    {
                        string command = "\"" + Application.ExecutablePath + "\" --tray";
                        if (SettingsStore.IsOverridden)
                        {
                            command += " --config \"" + SettingsStore.ConfigDirectory + "\"";
                        }
                        key.SetValue(SettingsStore.AppName, command);
                    }
                    else
                    {
                        key.DeleteValue(SettingsStore.AppName, false);
                    }
                }
                return true;
            }
            catch (Exception error)
            {
                Log.Write("could not change autostart: " + error.Message);
                return false;
            }
        }
    }
}
