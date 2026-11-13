# J.A.R.V.I.S. — universal phone/network/device compatibility

## Scope
The existing single-page command center, gold design, WebGL neural scene,
globe, microphone/Optical Sensor, local file selection and public webcams
are preserved. Nothing here can guarantee every conceivable browser/TV or
that external services work without credentials and permission.

## Phone sizes
Responsive system covers compact 280px, 320px, 360px, 390px, 430px, 540px,
split-screen and foldable inner viewports, 844×390 landscape, 768–1024px
tablets, 1366px notebooks, desktop 1920px and 4K TV at 3840px. Design
uses CSS viewport width rather than specific manufacturers or model names.

- Safe areas: rounded corners, notches and navigation home bars using env()
- Keyboard focus: 16px+ field text on phones to prevent Safari auto-zoom
- 44px+ primary touch targets, readable text and scrollable content
- Foldable/tablet narrow panel layouts; 2×2 system dock for normal phones;
  single-column fallback only for extremely narrow <300px viewports
- Reduced-motion and low-GPU modes keep the golden holographic identity
- Map legends/satellite imagery retain authentic technical colors

## WebGL
A single WebGL renderer is retained. Maximum canvas buffer, FPS **cap** and
particle count vary by the device's optional hardware capability hints:
- Economy: 15 FPS cap, 390,000 pixel budget, 25% of particles
- Balanced: 24 FPS cap, 850,000 pixel budget, 50% of particles
- High: 30 FPS cap, 1,550,000 pixel budget, full particles

Actual achieved FPS depends on the GPU, browser, thermal throttling and
other open tabs. The 64 graphic plates, five gyro arcs and synaptic nodes
remain structurally the same. No claim of 100% performance on every device.

## Network
Uses navigator.onLine, optional Network Information API (effectiveType,
downlink, RTT, saveData), and browser network/resize change events.
'4g' is an **effective connection-type hint**, not identification of the
physical Wi-Fi, LTE or 5G radio. iOS/Safari often lacks this interface:
unknown networks are supported with standard, conservative defaults.

Slow 2G/3G, user Save-Data, high latency, low download-rate hints and browser
offline states activate economy mode. The UI differentiates browser connectivity
from the J.A.R.V.I.S. backend actually responding. World webcams remain
explicitly opt-in; no automatic streaming, scanning or recording.

On disconnection while a page is **already loaded**, local terminal UI can
remain available. Remote AI, news, weather, maps and webcam streams still
require network access and cannot be guaranteed offline. This change does
not claim to supply a full offline PWA or a guaranteed carrier connection.

## Tests
Model: node tests/jarvis-universal-adaptive-model.mjs
Browser: node tests/jarvis-universal-adaptive-browser.mjs
CI also reruns source geometry, previous mobile responsiveness, P0 and
real-data safety. Run the browser test on real entry-level Android, iOS
Safari, foldables and physical TVs when possible: emulation is not a
hardware certification.
