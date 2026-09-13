import AppKit

let width = 1024
let height = 500
let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()

let canvas = NSRect(x: 0, y: 0, width: width, height: height)
let gradient = NSGradient(
  starting: NSColor(calibratedRed: 0.09, green: 0.46, blue: 0.67, alpha: 1),
  ending: NSColor(calibratedRed: 0.20, green: 0.65, blue: 0.82, alpha: 1)
)!
gradient.draw(in: canvas, angle: 18)

NSColor.white.withAlphaComponent(0.08).setFill()
NSBezierPath(ovalIn: NSRect(x: 760, y: 270, width: 390, height: 390)).fill()
NSColor.white.withAlphaComponent(0.06).setFill()
NSBezierPath(ovalIn: NSRect(x: -130, y: -150, width: 390, height: 390)).fill()

let centered = NSMutableParagraphStyle()
centered.alignment = .center

func drawText(_ value: String, y: CGFloat, height: CGFloat, font: NSFont, color: NSColor, kern: CGFloat = 0) {
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: color,
    .paragraphStyle: centered,
    .kern: kern
  ]
  (value as NSString).draw(
    in: NSRect(x: 40, y: y, width: CGFloat(width - 80), height: height),
    withAttributes: attributes
  )
}

drawText(
  "Raslash®",
  y: 262,
  height: 145,
  font: NSFont(name: "Georgia-Bold", size: 112) ?? NSFont.boldSystemFont(ofSize: 112),
  color: .white
)
drawText(
  "ÇALIŞ  ·  KEŞFET  ·  TANIŞ",
  y: 190,
  height: 58,
  font: NSFont.boldSystemFont(ofSize: 38),
  color: .white,
  kern: 2
)
drawText(
  "Doğru mekânı bul, topluluğa katıl.",
  y: 132,
  height: 44,
  font: NSFont.systemFont(ofSize: 25, weight: .medium),
  color: NSColor.white.withAlphaComponent(0.92)
)

image.unlockFocus()

guard
  let tiff = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiff),
  let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.95])
else {
  fatalError("Could not encode image")
}

try data.write(to: URL(fileURLWithPath: "app-store-assets/android/feature-graphic.jpg"))
