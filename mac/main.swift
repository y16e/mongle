// Mongle for Mac — 진짜 바탕화면 위에 몽글몽글 날씨
// A transparent, click-through overlay that runs the web engine (app.js)
// and feeds it the real window frames + mouse position.

import Cocoa
import WebKit
import ServiceManagement

final class OverlayWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

let EFFECTS: [(key: String, name: String, symbol: String)] = [
    ("snow", "눈", "❄️"), ("leaves", "낙엽", "🍂"), ("meteors", "별똥별", "🌠"),
    ("rain", "비", "🌧️"), ("sakura", "벚꽃", "🌸"), ("fireflies", "반딧불이", "✨"),
    ("pause", "일시 정지", "⏸️"),
]
let SCENES: [(key: String, name: String)] = [
    ("auto", "자동 (시간대에 맞춰)"), ("dawn", "새벽"), ("sunrise", "일출"), ("morning", "아침"),
    ("noon", "한낮"), ("golden", "골든 아워"), ("sunset", "일몰"), ("dusk", "해 질 녘"), ("night", "밤"),
    ("winter", "겨울"), ("rain", "비"), ("stars", "별"), ("fireflies", "반딧불이"), ("autumn", "가을"), ("spring", "봄"),
]
let LEVELS: [(value: Double, name: String)] = [(0.5, "살살"), (1.0, "보통"), (1.6, "펑펑"), (2.0, "폭설급")]

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: OverlayWindow!
    var web: WKWebView!
    var statusItem: NSStatusItem!
    var timer: Timer?
    var tick = 0
    var ready = false
    var lastAutoHour = -1
    let defaults = UserDefaults.standard

    var effect: String {
        get { defaults.string(forKey: "effect") ?? "snow" }
        set { defaults.set(newValue, forKey: "effect") }
    }
    var intensity: Double {
        get { defaults.object(forKey: "intensity") as? Double ?? 1.0 }
        set { defaults.set(newValue, forKey: "intensity") }
    }
    var wallpaper: String? {
        get { defaults.string(forKey: "wallpaper") }
        set { defaults.set(newValue, forKey: "wallpaper") }
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupOverlay()
        setupStatusItem()
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged),
            name: NSApplication.didChangeScreenParametersNotification, object: nil)
        timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.step() }
        RunLoop.main.add(timer!, forMode: .common)
    }

    // MARK: overlay

    var primary: NSScreen { NSScreen.screens.first ?? NSScreen.main! }

    func setupOverlay() {
        window = OverlayWindow(contentRect: primary.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        window.isReleasedWhenClosed = false

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "mongle")
        web = WKWebView(frame: window.contentView!.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        window.contentView!.addSubview(web)

        let dir = Bundle.main.resourceURL!.appendingPathComponent("web")
        web.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        window.orderFrontRegardless()
    }

    @objc func screensChanged() {
        window.setFrame(primary.frame, display: true)
    }

    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "ready" else { return }
        ready = true
        NSLog("Mongle: engine ready")
        web.evaluateJavaScript("mongleApply({effect: '\(effect)', intensity: \(intensity)})")
    }

    func step() {
        guard ready else { return }
        tick += 1
        let m = NSEvent.mouseLocation
        let f = primary.frame
        var js = String(format: "mongleSetPointer(%.1f,%.1f);", m.x - f.minX, f.maxY - m.y)
        if tick % 2 == 0 { js += "mongleSetWindows(\(windowsJSON()));" }
        web.evaluateJavaScript(js)

        if tick % 600 == 0 {   // every ~10 s, a health line in Console.app
            web.evaluateJavaScript("[parts.length, wins.length, Math.round(T), wins.reduce((a,w)=>a+w.surface.snow.reduce((x,y)=>x+y,0),0)|0].join(' ')") { [weak self] r, _ in
                guard let self else { return }
                let line = "particles/windows/frames/snowOnWindows = \(r ?? "?")\n"
                let url = self.wallpaperDir.deletingLastPathComponent().appendingPathComponent("status.txt")
                try? line.write(to: url, atomically: true, encoding: .utf8)
            }
        }
        if tick % 3600 == 0, wallpaper == "auto" {     // once a minute
            let h = Calendar.current.component(.hour, from: Date())
            if h != lastAutoHour { lastAutoHour = h; applyWallpaper("auto") }
        }
    }

    /// Real on-screen app windows, front to back, in overlay (top-left) coordinates.
    func windowsJSON() -> String {
        guard let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]] else { return "[]" }
        let me = ProcessInfo.processInfo.processIdentifier
        var out: [String] = []
        for w in info {
            guard (w[kCGWindowLayer as String] as? Int) == 0,
                  (w[kCGWindowOwnerPID as String] as? Int32) != me,
                  (w[kCGWindowAlpha as String] as? Double ?? 1) > 0.05,
                  let id = w[kCGWindowNumber as String] as? Int,
                  let bd = w[kCGWindowBounds as String],
                  let r = CGRect(dictionaryRepresentation: bd as! CFDictionary),
                  r.width >= 80, r.height >= 40 else { continue }
            out.append(String(format: "{\"id\":%d,\"x\":%.0f,\"y\":%.0f,\"w\":%.0f,\"h\":%.0f}",
                              id, r.minX, r.minY, r.width, r.height))
        }
        return "[" + out.joined(separator: ",") + "]"
    }

    // MARK: menu bar

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let img = NSImage(systemSymbolName: "cloud.snow.fill", accessibilityDescription: "Mongle") {
            img.isTemplate = true
            statusItem.button?.image = img
        } else {
            statusItem.button?.title = "☁︎"
        }
        rebuildMenu()
    }

    func rebuildMenu() {
        let menu = NSMenu()
        let title = NSMenuItem(title: "☁︎ Mongle", action: nil, keyEquivalent: "")
        title.isEnabled = false
        menu.addItem(title)
        menu.addItem(.separator())

        for (i, e) in EFFECTS.enumerated() {
            let item = NSMenuItem(title: "\(e.symbol)  \(e.name)", action: #selector(pickEffect(_:)),
                                  keyEquivalent: i < 6 ? "\(i + 1)" : "0")
            item.representedObject = e.key
            item.target = self
            item.state = e.key == effect ? .on : .off
            menu.addItem(item)
        }
        menu.addItem(.separator())

        let levelMenu = NSMenu()
        for l in LEVELS {
            let item = NSMenuItem(title: l.name, action: #selector(pickLevel(_:)), keyEquivalent: "")
            item.representedObject = l.value
            item.target = self
            item.state = abs(l.value - intensity) < 0.01 ? .on : .off
            levelMenu.addItem(item)
        }
        let levelItem = NSMenuItem(title: "세기", action: nil, keyEquivalent: "")
        levelItem.submenu = levelMenu
        menu.addItem(levelItem)

        let wpMenu = NSMenu()
        for s in SCENES {
            let item = NSMenuItem(title: s.name, action: #selector(pickWallpaper(_:)), keyEquivalent: "")
            item.representedObject = s.key
            item.target = self
            item.state = s.key == wallpaper ? .on : .off
            wpMenu.addItem(item)
            if s.key == "auto" { wpMenu.addItem(.separator()) }
        }
        wpMenu.addItem(.separator())
        let restore = NSMenuItem(title: "원래 배경화면으로 되돌리기", action: #selector(restoreWallpaper), keyEquivalent: "")
        restore.target = self
        restore.isEnabled = defaults.dictionary(forKey: "originalWallpapers") != nil
        wpMenu.addItem(restore)
        let wpItem = NSMenuItem(title: "배경화면", action: nil, keyEquivalent: "")
        wpItem.submenu = wpMenu
        menu.addItem(wpItem)

        let clear = NSMenuItem(title: "쌓인 것 모두 치우기", action: #selector(clearAll), keyEquivalent: "k")
        clear.target = self
        menu.addItem(clear)
        menu.addItem(.separator())

        let login = NSMenuItem(title: "로그인할 때 자동 실행", action: #selector(toggleLogin), keyEquivalent: "")
        login.target = self
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(login)

        let quit = NSMenuItem(title: "Mongle 종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        statusItem.menu = menu
    }

    @objc func pickEffect(_ sender: NSMenuItem) {
        guard let key = sender.representedObject as? String else { return }
        effect = key
        web.evaluateJavaScript("mongleApply({effect: '\(key)'})")
        rebuildMenu()
    }

    @objc func pickLevel(_ sender: NSMenuItem) {
        guard let v = sender.representedObject as? Double else { return }
        intensity = v
        web.evaluateJavaScript("mongleApply({intensity: \(v)})")
        rebuildMenu()
    }

    @objc func clearAll() {
        web.evaluateJavaScript("mongleApply({clear: true})")
    }

    @objc func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch {
            let a = NSAlert()
            a.messageText = "자동 실행을 바꾸지 못했어요"
            a.informativeText = "Mongle을 응용 프로그램 폴더로 옮긴 뒤 다시 해 보세요.\n(\(error.localizedDescription))"
            a.runModal()
        }
        rebuildMenu()
    }

    // MARK: wallpaper

    var wallpaperDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Mongle/Wallpapers", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    @objc func pickWallpaper(_ sender: NSMenuItem) {
        guard let key = sender.representedObject as? String else { return }
        // remember the user's own wallpaper the first time
        if defaults.dictionary(forKey: "originalWallpapers") == nil {
            var orig: [String: String] = [:]
            for s in NSScreen.screens {
                if let u = NSWorkspace.shared.desktopImageURL(for: s) { orig[s.localizedName] = u.path }
            }
            defaults.set(orig, forKey: "originalWallpapers")
        }
        wallpaper = key
        lastAutoHour = Calendar.current.component(.hour, from: Date())
        applyWallpaper(key)
        rebuildMenu()
    }

    func applyWallpaper(_ key: String) {
        for (i, screen) in NSScreen.screens.enumerated() {
            let scale = screen.backingScaleFactor
            let w = Int(screen.frame.width * scale), h = Int(screen.frame.height * scale)
            web.evaluateJavaScript("mongleRenderWallpaper('\(key)', \(w), \(h))") { [weak self] result, _ in
                guard let self, let s = result as? String, let comma = s.firstIndex(of: ","),
                      let data = Data(base64Encoded: String(s[s.index(after: comma)...])) else { return }
                let dir = self.wallpaperDir
                // macOS caches by path, so use a fresh name and drop the old file
                if let old = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
                    for f in old where f.lastPathComponent.hasPrefix("screen\(i)-") { try? FileManager.default.removeItem(at: f) }
                }
                let url = dir.appendingPathComponent("screen\(i)-\(key)-\(Int(Date().timeIntervalSince1970)).png")
                do {
                    try data.write(to: url)
                    try NSWorkspace.shared.setDesktopImageURL(url, for: screen, options: [:])
                } catch {
                    NSLog("Mongle wallpaper error: \(error)")
                }
            }
        }
    }

    @objc func restoreWallpaper() {
        guard let orig = defaults.dictionary(forKey: "originalWallpapers") as? [String: String] else { return }
        for s in NSScreen.screens {
            if let p = orig[s.localizedName] ?? orig.values.first {
                try? NSWorkspace.shared.setDesktopImageURL(URL(fileURLWithPath: p), for: s, options: [:])
            }
        }
        wallpaper = nil
        defaults.removeObject(forKey: "originalWallpapers")
        rebuildMenu()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
