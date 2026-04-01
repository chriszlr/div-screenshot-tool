# Div Screenshot Tool

A Chrome extension for capturing individual visible page elements like `div`, `section`, `article`, or buttons.

## Installation

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this folder: `/Users/chris/Dev/div-screenshots`

## Usage

1. Open any webpage.
2. Click the extension icon.
3. Start `Pick element`.
4. In selection mode, the `Viewport` and `Full Page` buttons appear in the top-right corner.
5. Move your mouse over the element you want and click if you only want to capture a single element.
6. Or click `Viewport` to capture the entire currently visible area.
7. Or click `Full Page` to scroll through the page and stitch the result into a single image.
8. In the dialog, choose `Copy image` or `Download`.
9. Press `ESC` to exit selection mode.

## Shortcut

- The popup shows the currently assigned shortcut.
- Use `Set shortcut` to open `chrome://extensions/shortcuts`.
- There you can assign a keyboard shortcut for `Div Screenshot Tool` that opens selection mode with the `Viewport` and `Full Page` buttons ready to use.

## Notes

- The extension captures the currently visible tab area and crops the selected element out of it.
- Very large elements, or elements that are partially outside the visible viewport, may not be captured completely.
