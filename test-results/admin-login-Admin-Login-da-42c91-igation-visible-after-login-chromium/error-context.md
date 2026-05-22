# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin/login.spec.ts >> Admin Login >> dashboard has sidebar navigation visible after login
- Location: e2e/admin/login.spec.ts:40:7

# Error details

```
Error: browser.newContext: Target page, context or browser has been closed
Browser logs:

<launching> /home/runner/workspace/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/tmp/playwright_chromiumdev_profile-3q5JPN --remote-debugging-pipe --no-startup-window
<launched> pid=9248
[pid=9248][err] [0521/114258.611349:FATAL:gin/v8_initializer.cc:654] Error loading V8 startup snapshot file
[pid=9248][err] [0521/114258.626969:FATAL:gin/v8_initializer.cc:654] Error loading V8 startup snapshot file
[pid=9248][err] [0521/114259.433906:ERROR:dbus/bus.cc:405] Failed to connect to the bus: Failed to connect to socket /run/dbus/system_bus_socket: No such file or directory
[pid=9248][err] [0521/114259.446851:ERROR:dbus/bus.cc:405] Failed to connect to the bus: Failed to connect to socket /run/dbus/system_bus_socket: No such file or directory
[pid=9248][err] [0521/114259.447477:ERROR:dbus/bus.cc:405] Failed to connect to the bus: Failed to connect to socket /run/dbus/system_bus_socket: No such file or directory
[pid=9248][err] [0521/114259.624638:WARNING:device/bluetooth/dbus/bluez_dbus_manager.cc:209] Floss manager service not available, cannot set Floss enable/disable.
[pid=9248][err] [0521/114259.625340:ERROR:content/browser/gpu/gpu_process_host.cc:993] GPU process launch failed: error_code=1002
[pid=9248][err] [0521/114259.625410:WARNING:content/browser/gpu/gpu_process_host.cc:1441] The GPU process has crashed 1 time(s)
[pid=9248][err] [0521/114259.640132:ERROR:content/browser/gpu/gpu_process_host.cc:993] GPU process launch failed: error_code=1002
[pid=9248][err] [0521/114259.640295:WARNING:content/browser/gpu/gpu_process_host.cc:1441] The GPU process has crashed 2 time(s)
[pid=9248][err] [0521/114259.647834:ERROR:content/browser/gpu/gpu_process_host.cc:993] GPU process launch failed: error_code=1002
[pid=9248][err] [0521/114259.648069:WARNING:content/browser/gpu/gpu_process_host.cc:1441] The GPU process has crashed 3 time(s)
[pid=9248][err] [0521/114259.658717:ERROR:content/browser/gpu/gpu_process_host.cc:993] GPU process launch failed: error_code=1002
[pid=9248][err] [0521/114259.659740:WARNING:content/browser/gpu/gpu_process_host.cc:1441] The GPU process has crashed 4 time(s)
[pid=9248][err] [0521/114259.682832:ERROR:content/browser/gpu/gpu_process_host.cc:993] GPU process launch failed: error_code=1002
[pid=9248][err] [0521/114259.682873:WARNING:content/browser/gpu/gpu_process_host.cc:1441] The GPU process has crashed 5 time(s)
[pid=9248][err] [0521/114259.693695:ERROR:content/browser/gpu/gpu_process_host.cc:993] GPU process launch failed: error_code=1002
[pid=9248][err] [0521/114259.693760:WARNING:content/browser/gpu/gpu_process_host.cc:1441] The GPU process has crashed 6 time(s)
[pid=9248][err] [0521/114259.693828:FATAL:content/browser/gpu/gpu_data_manager_impl_private.cc:417] GPU process isn't usable. Goodbye.
[pid=9248][err] [0521/114259.800343:FATAL:gin/v8_initializer.cc:654] Error loading V8 startup snapshot file
```