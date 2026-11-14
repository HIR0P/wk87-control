using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace Wk87Remap
{
    /// <summary>
    /// Head-less sanity checks for the parts that can be proven without a
    /// keyboard: name parsing, map building and config round-trips.
    /// Run with:  WK87Remap.exe --selftest
    /// Results land in selftest.log next to the exe; exit code 0 means pass.
    /// </summary>
    internal static class SelfTest
    {
        private static readonly StringBuilder Report = new StringBuilder();
        private static int _failed;

        public static int Run()
        {
            Report.AppendLine("WK87 Remap self-test");
            Report.AppendLine(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));
            Report.AppendLine();

            CheckParsing();
            CheckDisplayNames();
            CheckPicker();
            CheckMapBuilding();
            CheckConfigRoundTrip();

            Report.AppendLine();
            Report.AppendLine(_failed == 0
                ? "RESULT: all checks passed"
                : "RESULT: " + _failed + " check(s) failed");

            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "selftest.log");
            File.WriteAllText(path, Report.ToString(), new UTF8Encoding(false));
            return _failed == 0 ? 0 : 1;
        }

        private static void CheckParsing()
        {
            Head("Key name parsing");

            ExpectKey("CapsLock", 0x14);
            ExpectKey("caps lock", 0x14);
            ExpectKey("Win", 0x5B);
            ExpectKey("LWin", 0x5B);
            ExpectKey("0x41", 0x41);
            ExpectKey("A", 0x41);
            ExpectKey("7", 0x37);
            ExpectKey("Page Up", 0x21);
            ExpectKey("F13", 0x7C);
            ExpectKey("Num 3", 0x63);
            ExpectKey("Esc", 0x1B);

            int disabled;
            Check("Disable parses to key 0",
                KeyNames.TryParse("Disable", out disabled) && disabled == 0,
                "value " + disabled);

            int nonsense;
            Check("Unknown name is rejected",
                !KeyNames.TryParse("NotAKey", out nonsense),
                "accepted as " + nonsense);

            int control;
            Check("Control maps to left Ctrl",
                KeyNames.TryParse("Control", out control) && control == 0xA2,
                "value 0x" + control.ToString("X2"));
        }

        private static void CheckDisplayNames()
        {
            Head("Display names");

            Check("Caps Lock display", KeyNames.DisplayName(0x14) == "Caps Lock", KeyNames.DisplayName(0x14));
            Check("Win display", KeyNames.DisplayName(0x5B) == "Win", KeyNames.DisplayName(0x5B));
            Check("Disable display", KeyNames.DisplayName(0) == "Disable", KeyNames.DisplayName(0));
            Check("CapsLock canonical", KeyNames.CanonicalName(0x14) == "CapsLock", KeyNames.CanonicalName(0x14));
            Check("Number row canonical", KeyNames.CanonicalName(0x37) == "D7", KeyNames.CanonicalName(0x37));
        }

        private static void CheckPicker()
        {
            Head("Picker list");

            string[] names = KeyNames.PickerNames();
            Check("Picker is not empty", names.Length > 60, names.Length + " names");

            List<string> broken = new List<string>();
            foreach (string name in names)
            {
                int key;
                if (!KeyNames.TryParse(name, out key))
                {
                    broken.Add(name);
                }
            }
            Check("Every picker entry parses", broken.Count == 0, string.Join(", ", broken.ToArray()));
        }

        private static void CheckMapBuilding()
        {
            Head("Map building");

            Settings rescue = new Settings();
            rescue.WinRescue = true;
            List<string> warnings = new List<string>();
            Dictionary<int, int> rescueMap = SettingsStore.BuildMap(rescue, warnings);
            Check("Win Rescue maps Caps Lock to Win",
                rescueMap.Count == 1 && rescueMap.ContainsKey(0x14) && rescueMap[0x14] == 0x5B,
                Describe(rescueMap));

            Settings explicitRule = new Settings();
            explicitRule.WinRescue = true;
            explicitRule.Remaps.Add(Rule("CapsLock", "Disable"));
            explicitRule.Remaps.Add(Rule("A", "B"));
            warnings.Clear();
            Dictionary<int, int> map = SettingsStore.BuildMap(explicitRule, warnings);
            Check("Explicit rule wins over Win Rescue",
                map.ContainsKey(0x14) && map[0x14] == 0,
                Describe(map));
            Check("A is swapped for B",
                map.ContainsKey(0x41) && map[0x41] == 0x42,
                Describe(map));
            Check("No warnings on a valid config", warnings.Count == 0,
                string.Join("; ", warnings.ToArray()));

            Settings broken = new Settings();
            broken.Remaps.Add(Rule("NotAKey", "B"));
            broken.Remaps.Add(Rule("C", "AlsoNotAKey"));
            warnings.Clear();
            Dictionary<int, int> brokenMap = SettingsStore.BuildMap(broken, warnings);
            Check("Broken rules are skipped with warnings",
                brokenMap.Count == 0 && warnings.Count == 2,
                warnings.Count + " warning(s), " + Describe(brokenMap));

            Settings disableOnly = new Settings();
            disableOnly.Remaps.Add(Rule("F12", "Disable"));
            warnings.Clear();
            Dictionary<int, int> disableMap = SettingsStore.BuildMap(disableOnly, warnings);
            Check("Disable target becomes key 0",
                disableMap.ContainsKey(0x7B) && disableMap[0x7B] == 0,
                Describe(disableMap));
        }

        private static void CheckConfigRoundTrip()
        {
            Head("Config round-trip");

            string directory = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory, "selftest-tmp");
            string path = Path.Combine(directory, "config.json");

            try
            {
                Directory.CreateDirectory(directory);

                Settings saved = new Settings();
                saved.WinRescue = true;
                saved.GameMode = true;
                saved.PanicHoldMs = 4000;
                saved.Remaps.Add(Rule("CapsLock", "LWin"));
                saved.Remaps.Add(Rule("F12", "Disable"));

                Check("Save succeeds", SettingsStore.SaveTo(path, saved), path);
                Check("File exists", File.Exists(path), path);

                Settings loaded = SettingsStore.LoadFrom(path);
                Check("WinRescue survives", loaded.WinRescue, loaded.WinRescue.ToString());
                Check("GameMode survives", loaded.GameMode, loaded.GameMode.ToString());
                Check("Panic hold survives", loaded.PanicHoldMs == 4000,
                    loaded.PanicHoldMs.ToString(CultureInfo.InvariantCulture));
                Check("Both rules survive", loaded.Remaps.Count == 2,
                    loaded.Remaps.Count + " rule(s)");
                Check("Rule order survives",
                    loaded.Remaps.Count == 2 &&
                    loaded.Remaps[0].From == "CapsLock" &&
                    loaded.Remaps[0].To == "LWin" &&
                    loaded.Remaps[1].From == "F12" &&
                    loaded.Remaps[1].To == "Disable",
                    loaded.Remaps.Count == 2 ? loaded.Remaps[0].From + ">" + loaded.Remaps[0].To : "missing");

                Settings clamped = new Settings();
                clamped.PanicHoldMs = 50;
                SettingsStore.SaveTo(path, clamped);
                Settings reloaded = SettingsStore.LoadFrom(path);
                Check("Silly panic value is clamped to 3000",
                    reloaded.PanicHoldMs == 3000,
                    reloaded.PanicHoldMs.ToString(CultureInfo.InvariantCulture));

                Settings missing = SettingsStore.LoadFrom(Path.Combine(directory, "nope.json"));
                Check("Missing file gives defaults",
                    !missing.WinRescue && !missing.GameMode && missing.PanicHoldMs == 3000 &&
                    missing.Remaps != null,
                    "remaps=" + (missing.Remaps == null ? "null" : missing.Remaps.Count.ToString()));
            }
            catch (Exception error)
            {
                Check("Round-trip did not throw", false, error.Message);
            }
            finally
            {
                try
                {
                    if (Directory.Exists(directory))
                    {
                        Directory.Delete(directory, true);
                    }
                }
                catch (Exception error)
                {
                    Report.AppendLine("note: could not clean " + directory + " (" + error.Message + ")");
                }
            }
        }

        private static RemapRule Rule(string from, string to)
        {
            RemapRule rule = new RemapRule();
            rule.From = from;
            rule.To = to;
            return rule;
        }

        private static void ExpectKey(string name, int expected)
        {
            int actual;
            bool parsed = KeyNames.TryParse(name, out actual);
            Check("parse \"" + name + "\" -> 0x" + expected.ToString("X2"),
                parsed && actual == expected,
                parsed ? "got 0x" + actual.ToString("X2") : "rejected");
        }

        private static string Describe(Dictionary<int, int> map)
        {
            List<string> parts = new List<string>();
            foreach (KeyValuePair<int, int> pair in map)
            {
                parts.Add("0x" + pair.Key.ToString("X2") + "->0x" + pair.Value.ToString("X2"));
            }
            return parts.Count == 0 ? "empty" : string.Join(", ", parts.ToArray());
        }

        private static void Head(string title)
        {
            Report.AppendLine("-- " + title);
        }

        private static void Check(string name, bool passed, string detail)
        {
            if (passed)
            {
                Report.AppendLine("PASS  " + name);
                return;
            }

            _failed++;
            Report.AppendLine("FAIL  " + name + "  [" + detail + "]");
        }
    }
}
