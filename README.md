# Pump Skid Baseframe Generator

A browser tool that generates the welded steel baseframe for an API 610 pump-and-driver set. Choose a pump and a driver; it sizes the frame and crossmembers, lays out the machined mounting pads and bolt holes, sets the deck drainage slope, estimates steel mass and cost, and exports a DXF drawing plus an OnShape configuration payload. Everything updates live as you change inputs.

> **Live demo:** <https://skidgen.netlify.app/>

## What it generates

- A sized welded frame: two main channels plus crossmembers placed under the equipment foot lines, filled so no bay spans more than 700 mm.
- Machined mounting pads under each foot, hold-down holes matched to each unit's foot pattern (bolt size scaled by equipment mass), and perimeter anchor holes.
- An API 610 deck drainage slope toward the pump end.
- Steel mass and a rough fabricated-cost estimate.
- A multi-layer **DXF** drawing that opens in any CAD package, and an **OnShape** configuration-update payload.

## Why these choices

The design decisions are what make the output a fabricable part rather than a box: crossmembers sit under the load, the pads are called out to be machined flat and coplanar after welding so the equipment actually aligns, holes match each unit's foot pattern with running clearance, and the deck slopes to drain.

Sizing here is deliberately simplified for a demo: representative equipment dimensions and a flat 1.5x dynamic factor. Real fabrication would size members against load calculations and a full bolt and weld check. The footer in the app says the same.

## Run it

No build step and nothing to install.

- Open `index.html` directly, or serve the folder:
  ```
  python3 -m http.server
  ```
  then visit http://localhost:8000
- Deploy to any static host (Netlify, GitHub Pages, Vercel). There is no build command; just publish the folder.

## Stack

Plain HTML, CSS, and JavaScript. [three.js](https://threejs.org) (loaded from a CDN) renders the 3D preview. The DXF is written directly as ASCII R12. No framework, no dependencies to install.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup |
| `styles.css` | Styling |
| `app.js` | Geometry model, renderers (plan / specs / notes / 3D), DXF export |

All geometry comes from one model in `buildModel()`, expressed in skid coordinates (origin bottom-left, millimetres, y-up); each renderer maps from it.

## Notes

Prototype by Simone Scheuer. Pump model families and driver frames use real designations; dimensions are representative for demonstration.
