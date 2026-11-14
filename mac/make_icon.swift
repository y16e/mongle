// Draws the Mongle app icon: usage `swift make_icon.swift out.png`
import Cocoa

let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let rect = NSRect(x: 100, y: 100, width: 824, height: 824)
let path = NSBezierPath(roundedRect: rect, xRadius: 185, yRadius: 185)
NSGradient(colors: [NSColor(red: 0.36, green: 0.62, blue: 1, alpha: 1),
                    NSColor(red: 0.55, green: 0.42, blue: 0.95, alpha: 1)])!.draw(in: path, angle: -70)

// fluffy cloud
NSColor.white.setFill()
for (x, y, r) in [(390.0, 520.0, 130.0), (530.0, 590.0, 165.0), (670.0, 515.0, 120.0)] {
    NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: r * 2, height: r * 2)).fill()
}
NSBezierPath(roundedRect: NSRect(x: 270, y: 395, width: 520, height: 150), xRadius: 75, yRadius: 75).fill()

// little face
NSColor(red: 0.3, green: 0.32, blue: 0.5, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 445, y: 490, width: 34, height: 40)).fill()
NSBezierPath(ovalIn: NSRect(x: 585, y: 490, width: 34, height: 40)).fill()
NSColor(red: 1, green: 0.6, blue: 0.7, alpha: 0.7).setFill()
NSBezierPath(ovalIn: NSRect(x: 400, y: 448, width: 50, height: 28)).fill()
NSBezierPath(ovalIn: NSRect(x: 615, y: 448, width: 50, height: 28)).fill()

// snow dots
NSColor(white: 1, alpha: 0.9).setFill()
for (x, y, r) in [(330.0, 300.0, 18.0), (460.0, 250.0, 14.0), (590.0, 310.0, 20.0), (720.0, 245.0, 15.0), (250.0, 760.0, 12.0), (780.0, 790.0, 16.0)] {
    NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: r * 2, height: r * 2)).fill()
}
img.unlockFocus()

let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
