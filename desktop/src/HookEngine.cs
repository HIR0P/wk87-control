using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Wk87Remap
{
    /// <summary>
    /// Global low-level keyboard hook. Intercepts physical key presses before
    /// any application sees them, swaps them for their mapped target and hands
    /// the rest straight back to Windows.
    ///
    /// Injected events (our own SendInput calls) are recognised by the
    /// LLKHF_INJECTED flag and passed through untouched, so a remap can never
    /// loop back into itself.
    /// </summary>
    internal sealed class HookEngine : IDisposable
    {
        private readonly Native.LowLevelKeyboardProc _callback;
        private readonly Dictionary<int, int> _map = new Dictionary<int, int>();
        private readonly Dictionary<int, int> _held = new Dictionary<int, int>();
        private readonly Timer _panicTimer;

        private IntPtr _hook = IntPtr.Zero;
        private long _escDownAt;
        private bool _panicFired;
        private bool _capturing;
        private int _captureRelease;
        private bool _paused;
        private bool _disposed;

        public event Action<Keys> Captured;
        public event EventHandler PanicTriggered;

        /// <summary>Block the Windows keys (set by Game Mode).</summary>
        public bool GameMode { get; set; }

        /// <summary>When true every key passes through unmodified.</summary>
        public bool Paused
        {
            get { return _paused; }
            set
            {
                if (_paused == value)
                {
                    return;
                }

                if (value)
                {
                    // Never leave a swapped key stuck in the down state.
                    ReleaseHeld();
                }

                _paused = value;
            }
        }

        public int PanicHoldMs { get; set; }

        public bool CaptureArmed
        {
            get { return _capturing; }
        }

        public HookEngine()
        {
            _callback = OnKey;
            PanicHoldMs = 3000;
            _panicTimer = new Timer();
            _panicTimer.Interval = 150;
            _panicTimer.Tick += OnPanicTick;
        }

        public void SetMap(Dictionary<int, int> map)
        {
            _map.Clear();
            if (map == null)
            {
                return;
            }
            foreach (KeyValuePair<int, int> pair in map)
            {
                _map[pair.Key] = pair.Value;
            }
        }

        public void Start()
        {
            if (_hook != IntPtr.Zero)
            {
                return;
            }

            IntPtr module = Native.GetModuleHandle(null);
            _hook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, _callback, module, 0);
            if (_hook == IntPtr.Zero)
            {
                int error = Marshal.GetLastWin32Error();
                Log.Write("hook install failed: error " + error);
                throw new InvalidOperationException(
                    "Windows refused the keyboard hook (error " + error + "). " +
                    "Another remapper may already be running.");
            }

            Log.Write("keyboard hook installed");
        }

        public void Stop()
        {
            if (_hook == IntPtr.Zero)
            {
                return;
            }

            Native.UnhookWindowsHookEx(_hook);
            _hook = IntPtr.Zero;
            ReleaseHeld();
            _panicTimer.Stop();
            Log.Write("keyboard hook removed");
        }

        private void ReleaseHeld()
        {
            if (_held.Count == 0)
            {
                return;
            }

            foreach (int target in _held.Values)
            {
                if (target != 0)
                {
                    Inject(target, false);
                }
            }
            _held.Clear();
        }

        public void ArmCapture()
        {
            _capturing = true;
        }

        public void DisarmCapture()
        {
            _capturing = false;
        }

        private IntPtr OnKey(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode < 0)
            {
                return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            Native.KbdLlHookStruct data =
                (Native.KbdLlHookStruct)Marshal.PtrToStructure(
                    lParam, typeof(Native.KbdLlHookStruct));

            int message = (int)wParam;
            bool isDown = message == Native.WM_KEYDOWN || message == Native.WM_SYSKEYDOWN;
            bool isUp = message == Native.WM_KEYUP || message == Native.WM_SYSKEYUP;
            bool injected = (data.flags & Native.LLKHF_INJECTED) != 0;
            int vk = (int)data.vkCode;

            if (injected)
            {
                if (GameMode && (vk == Native.VK_LWIN || vk == Native.VK_RWIN))
                {
                    return new IntPtr(1);
                }
                return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            if (!isDown && !isUp)
            {
                return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            // Capture mode eats the next physical key (down and matching up).
            if (_capturing)
            {
                if (isDown)
                {
                    _capturing = false;
                    _captureRelease = vk;
                    Action<Keys> handler = Captured;
                    if (handler != null)
                    {
                        handler((Keys)vk);
                    }
                    return new IntPtr(1);
                }
                return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            if (_captureRelease == vk && isUp)
            {
                _captureRelease = 0;
                return new IntPtr(1);
            }

            // The panic combo is checked on the *physical* Esc key, before any
            // remap applies, so a broken config can always be escaped.
            if (vk == Native.VK_ESCAPE && !Paused)
            {
                HandlePanic(isDown);
            }

            if (Paused)
            {
                return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            if (GameMode && (vk == Native.VK_LWIN || vk == Native.VK_RWIN))
            {
                return new IntPtr(1);
            }

            int target;
            if (!_map.TryGetValue(vk, out target) || target == vk)
            {
                return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            if (isDown)
            {
                if (target == 0)
                {
                    // "Disable": swallow the key entirely until it is released.
                    if (!_held.ContainsKey(vk))
                    {
                        _held[vk] = 0;
                    }
                    return new IntPtr(1);
                }

                int heldTarget;
                if (!_held.TryGetValue(vk, out heldTarget))
                {
                    _held[vk] = target;
                    heldTarget = target;
                }

                Inject(heldTarget, true);
                return new IntPtr(1);
            }

            // Key up: release whatever we injected for this physical key.
            int releasedTarget;
            if (_held.TryGetValue(vk, out releasedTarget))
            {
                _held.Remove(vk);
                if (releasedTarget != 0)
                {
                    Inject(releasedTarget, false);
                }
                return new IntPtr(1);
            }

            return Native.CallNextHookEx(_hook, nCode, wParam, lParam);
        }

        private void HandlePanic(bool isDown)
        {
            if (isDown)
            {
                if (_escDownAt == 0)
                {
                    _escDownAt = Environment.TickCount;
                    _panicFired = false;
                    _panicTimer.Start();
                }
                return;
            }

            _escDownAt = 0;
            _panicTimer.Stop();
        }

        private void OnPanicTick(object sender, EventArgs e)
        {
            if (_escDownAt == 0 || _panicFired)
            {
                _panicTimer.Stop();
                return;
            }

            long elapsed = Environment.TickCount - _escDownAt;
            if (elapsed < PanicHoldMs)
            {
                return;
            }

            _panicFired = true;
            _panicTimer.Stop();
            SetPaused(true);

            EventHandler handler = PanicTriggered;
            if (handler != null)
            {
                handler(this, EventArgs.Empty);
            }
        }

        private void SetPaused(bool paused)
        {
            Paused = paused;
        }

        public static void Inject(int virtualKey, bool down)
        {
            Native.Input input = new Native.Input();
            input.type = Native.INPUT_KEYBOARD;
            input.u.ki.wVk = (ushort)virtualKey;
            input.u.ki.wScan = 0;
            input.u.ki.dwFlags = down ? 0u : Native.KEYEVENTF_KEYUP;
            input.u.ki.time = 0;
            input.u.ki.dwExtraInfo = IntPtr.Zero;

            Native.Input[] batch = new Native.Input[] { input };
            uint sent = Native.SendInput(
                (uint)batch.Length, batch, Marshal.SizeOf(typeof(Native.Input)));
            if (sent != 1)
            {
                Log.Write("SendInput failed for 0x" + virtualKey.ToString("X2") +
                          " (error " + Marshal.GetLastWin32Error() + ")");
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;
            Stop();
            _panicTimer.Dispose();
        }
    }
}
