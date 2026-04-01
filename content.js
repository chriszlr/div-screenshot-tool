const overlayId = "__div_screenshot_overlay__";
const tooltipId = "__div_screenshot_tooltip__";
const toolbarId = "__div_screenshot_toolbar__";
const actionDialogId = "__div_screenshot_action_dialog__";
const maxCanvasEdge = 32767;
const maxCanvasArea = 268435456;

let selectionActive = false;
let captureInProgress = false;
let currentTarget = null;
let overlayElement = null;
let tooltipElement = null;
let toolbarElement = null;
let actionDialogElement = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_ELEMENT_PICKER") {
    startPicker();
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "STOP_ELEMENT_PICKER") {
    stopPicker();
    sendResponse({ ok: true });
  }
});

function startPicker() {
  if (selectionActive || captureInProgress) {
    return;
  }

  removeActionDialog();
  selectionActive = true;
  ensureOverlay();
  ensureTooltip();
  ensureToolbar();

  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  updateTooltip(
    "Move over an element and click to capture it. Top right: Viewport or Full Page. Press ESC to exit."
  );
}

function stopPicker() {
  selectionActive = false;
  captureInProgress = false;
  currentTarget = null;

  document.removeEventListener("mousemove", handleMouseMove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);

  overlayElement?.remove();
  tooltipElement?.remove();
  toolbarElement?.remove();
  overlayElement = null;
  tooltipElement = null;
  toolbarElement = null;
}

function handleMouseMove(event) {
  if (!selectionActive || captureInProgress) {
    return;
  }

  const target = getSelectableTarget(event.clientX, event.clientY);
  if (!target) {
    return;
  }

  currentTarget = target;
  renderHighlight(target.getBoundingClientRect());
  updateTooltip(buildLabel(target));
}

async function handleClick(event) {
  if (!selectionActive || captureInProgress) {
    return;
  }

  if (isExtensionUiNode(event.target)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const target = getSelectableTarget(event.clientX, event.clientY) || currentTarget;
  if (!target) {
    return;
  }

  currentTarget = target;
  const rect = target.getBoundingClientRect();

  try {
    captureInProgress = true;
    updateTooltip("Creating element screenshot...");
    setPickerVisibility(false);
    await waitForNextPaint();
    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_ELEMENT",
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unknown error");
    }

    stopPicker();
    showActionDialog(response);
  } catch (error) {
    captureInProgress = false;
    restorePickerAfterError(rect, error);
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    stopPicker();
  }
}

function getSelectableTarget(clientX, clientY) {
  if (!overlayElement || !tooltipElement) {
    return null;
  }

  overlayElement.style.pointerEvents = "none";
  tooltipElement.style.pointerEvents = "none";

  const target = document.elementFromPoint(clientX, clientY);

  overlayElement.style.pointerEvents = "none";
  tooltipElement.style.pointerEvents = "none";

  if (!target || target === document.documentElement || target === document.body) {
    return null;
  }

  if (isExtensionUiNode(target)) {
    return null;
  }

  return target;
}

function isExtensionUiNode(node) {
  return Boolean(
    node instanceof Node &&
      ((overlayElement && overlayElement.contains(node)) ||
        (tooltipElement && tooltipElement.contains(node)) ||
        (toolbarElement && toolbarElement.contains(node)) ||
        (actionDialogElement && actionDialogElement.contains(node)))
  );
}

function renderHighlight(rect) {
  if (!overlayElement) {
    return;
  }

  overlayElement.style.top = `${Math.max(0, rect.top + window.scrollY)}px`;
  overlayElement.style.left = `${Math.max(0, rect.left + window.scrollX)}px`;
  overlayElement.style.width = `${Math.max(0, rect.width)}px`;
  overlayElement.style.height = `${Math.max(0, rect.height)}px`;
}

function ensureOverlay() {
  if (overlayElement) {
    return;
  }

  overlayElement = document.createElement("div");
  overlayElement.id = overlayId;
  Object.assign(overlayElement.style, {
    position: "absolute",
    zIndex: "2147483647",
    border: "2px solid #ff5a36",
    background: "rgba(255, 90, 54, 0.18)",
    boxShadow: "0 0 0 99999px rgba(15, 18, 25, 0.12)",
    pointerEvents: "none",
    transition: "all 0.06s ease"
  });
  document.documentElement.appendChild(overlayElement);
}

function ensureTooltip() {
  if (tooltipElement) {
    return;
  }

  tooltipElement = document.createElement("div");
  tooltipElement.id = tooltipId;
  Object.assign(tooltipElement.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    maxWidth: "360px",
    padding: "10px 12px",
    borderRadius: "12px",
    background: "#151821",
    color: "#f7f1e8",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    lineHeight: "1.4",
    boxShadow: "0 14px 40px rgba(0, 0, 0, 0.28)",
    pointerEvents: "none"
  });
  document.documentElement.appendChild(tooltipElement);
}

function ensureToolbar() {
  if (toolbarElement) {
    return;
  }

  toolbarElement = document.createElement("div");
  toolbarElement.id = toolbarId;
  Object.assign(toolbarElement.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "2147483647",
    display: "flex",
    gap: "10px",
    alignItems: "center",
    padding: "10px",
    borderRadius: "18px",
    background: "rgba(255, 248, 241, 0.94)",
    boxShadow: "0 20px 48px rgba(0, 0, 0, 0.18)",
    border: "1px solid rgba(54, 38, 24, 0.12)",
    backdropFilter: "blur(8px)"
  });

  const viewportButton = createToolbarButton("Viewport");
  const fullPageButton = createToolbarButton("Full Page");

  viewportButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleViewportCapture();
  });

  fullPageButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleFullPageCapture();
  });

  toolbarElement.append(viewportButton, fullPageButton);
  document.documentElement.appendChild(toolbarElement);
}

function createToolbarButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  Object.assign(button.style, {
    appearance: "none",
    border: "0",
    borderRadius: "999px",
    padding: "11px 15px",
    cursor: "pointer",
    background: "linear-gradient(135deg, #1f1a17, #48382d)",
    color: "#fff8f1",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    fontWeight: "700",
    boxShadow: "0 10px 24px rgba(38, 26, 17, 0.2)"
  });
  return button;
}

function updateTooltip(text) {
  if (tooltipElement) {
    tooltipElement.textContent = text;
  }
}

function setPickerVisibility(isVisible) {
  const displayValue = isVisible ? "block" : "none";
  const toolbarDisplayValue = isVisible ? "flex" : "none";

  if (overlayElement) {
    overlayElement.style.display = displayValue;
  }

  if (tooltipElement) {
    tooltipElement.style.display = displayValue;
  }

  if (toolbarElement) {
    toolbarElement.style.display = toolbarDisplayValue;
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function waitForScrollSettling(delayMs = 140) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    }, delayMs);
  });
}

function buildLabel(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = typeof element.className === "string"
    ? element.className
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((name) => `.${name}`)
        .join("")
    : "";

  return `Auswahl: ${tag}${id}${classes || ""}`;
}

async function handleViewportCapture() {
  if (!selectionActive || captureInProgress) {
    return;
  }

  try {
    captureInProgress = true;
    updateTooltip("Creating viewport screenshot...");
    setPickerVisibility(false);
    await waitForNextPaint();
    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_VIEWPORT" });

    if (!response?.ok) {
      throw new Error(response?.error || "Viewport capture failed.");
    }

    stopPicker();
    showActionDialog(response);
  } catch (error) {
    captureInProgress = false;
    setPickerVisibility(true);
    updateTooltip(`Error: ${error.message}`);
  }
}

async function handleFullPageCapture() {
  if (!selectionActive || captureInProgress) {
    return;
  }

  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;
  const restoreScrollBehavior = disableSmoothScroll();

  try {
    captureInProgress = true;
    updateTooltip("Creating full-page screenshot...");
    setPickerVisibility(false);
    await waitForNextPaint();

    const capture = await captureFullPageComposite(originalScrollX, originalScrollY);

    window.scrollTo(originalScrollX, originalScrollY);
    await waitForScrollSettling();
    restoreScrollBehavior();

    stopPicker();
    showActionDialog(capture);
  } catch (error) {
    restoreScrollBehavior();
    window.scrollTo(originalScrollX, originalScrollY);
    await waitForScrollSettling();
    captureInProgress = false;
    setPickerVisibility(true);

    if (currentTarget) {
      renderHighlight(currentTarget.getBoundingClientRect());
    }

    updateTooltip(`Error: ${error.message}`);
  }
}

async function captureFullPageComposite(originalScrollX, originalScrollY) {
  const pageMetrics = getPageMetrics();
  const scrollSteps = buildVerticalScrollSteps(pageMetrics.fullHeight, pageMetrics.viewportHeight);

  let canvas = null;
  let context = null;
  let scale = 1;

  for (const scrollY of scrollSteps) {
    window.scrollTo(originalScrollX, scrollY);
    await waitForScrollSettling();

    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_VIEWPORT" });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not capture the viewport.");
    }

    const image = await loadImage(response.dataUrl);

    if (!canvas) {
      scale = image.width / pageMetrics.viewportWidth;
      const canvasWidth = Math.round(pageMetrics.viewportWidth * scale);
      const canvasHeight = Math.round(pageMetrics.fullHeight * scale);

      assertCanvasSize(canvasWidth, canvasHeight);

      canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not create the canvas for the full-page screenshot.");
      }
    }

    const drawY = Math.round(scrollY * scale);
    const remainingHeight = canvas.height - drawY;
    const sourceHeight = Math.min(image.height, remainingHeight);

    context.drawImage(
      image,
      0,
      0,
      image.width,
      sourceHeight,
      0,
      drawY,
      image.width,
      sourceHeight
    );
  }

  if (!canvas) {
    throw new Error("Could not assemble the full-page screenshot.");
  }

  return {
    filename: `full-page-screenshot-${Date.now()}.png`,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function getPageMetrics() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  const fullHeight = Math.max(
    scrollingElement.scrollHeight,
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0
  );
  const viewportHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const viewportWidth = Math.max(window.innerWidth, document.documentElement.clientWidth);

  return {
    fullHeight,
    viewportHeight,
    viewportWidth
  };
}

function buildVerticalScrollSteps(fullHeight, viewportHeight) {
  const maxScrollY = Math.max(0, fullHeight - viewportHeight);
  const steps = [];

  for (let currentY = 0; currentY <= maxScrollY; currentY += viewportHeight) {
    steps.push(currentY);
  }

  if (steps.length === 0 || steps[steps.length - 1] !== maxScrollY) {
    steps.push(maxScrollY);
  }

  return [...new Set(steps)];
}

function assertCanvasSize(width, height) {
  if (width > maxCanvasEdge || height > maxCanvasEdge || width * height > maxCanvasArea) {
    throw new Error("This page is too large for a single full-page screenshot.");
  }
}

function disableSmoothScroll() {
  const html = document.documentElement;
  const body = document.body;
  const previousHtml = html.style.scrollBehavior;
  const previousBody = body ? body.style.scrollBehavior : "";

  html.style.scrollBehavior = "auto";
  if (body) {
    body.style.scrollBehavior = "auto";
  }

  return () => {
    html.style.scrollBehavior = previousHtml;
    if (body) {
      body.style.scrollBehavior = previousBody;
    }
  };
}

async function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the screenshot image."));
    image.src = dataUrl;
  });
}

function restorePickerAfterError(rect, error) {
  setPickerVisibility(true);
  renderHighlight(rect);
  updateTooltip(`Error: ${error.message}`);
}

function showActionDialog(capture) {
  removeActionDialog();

  actionDialogElement = document.createElement("div");
  actionDialogElement.id = actionDialogId;
  Object.assign(actionDialogElement.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "rgba(17, 18, 23, 0.42)"
  });

  const dialog = document.createElement("div");
  Object.assign(dialog.style, {
    width: "min(420px, 100%)",
    maxHeight: "min(80vh, 720px)",
    overflow: "auto",
    borderRadius: "20px",
    background: "#fff8f1",
    color: "#231a14",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.28)",
    padding: "18px"
  });

  const title = document.createElement("h2");
  title.textContent = "Screenshot ready";
  Object.assign(title.style, {
    margin: "0 0 10px",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "24px",
    lineHeight: "1.1"
  });

  const copy = document.createElement("p");
  copy.textContent = "You can now copy the image or download it as a PNG.";
  Object.assign(copy.style, {
    margin: "0 0 14px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    lineHeight: "1.45",
    color: "#58453a"
  });

  const preview = document.createElement("img");
  preview.src = capture.dataUrl;
  preview.alt = "Vorschau des Screenshots";
  Object.assign(preview.style, {
    display: "block",
    width: "100%",
    maxHeight: "320px",
    objectFit: "contain",
    borderRadius: "14px",
    background: "#f2e8dc",
    border: "1px solid rgba(54, 38, 24, 0.12)",
    marginBottom: "14px"
  });

  const buttonRow = document.createElement("div");
  Object.assign(buttonRow.style, {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  });

  const copyButton = createDialogButton("Copy image", false);
  const downloadButton = createDialogButton("Download", true);
  const closeButton = createDialogButton("Close", false, true);

  const status = document.createElement("p");
  status.textContent = capture.filename;
  Object.assign(status.style, {
    margin: "14px 0 0",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    lineHeight: "1.45",
    color: "#705747",
    wordBreak: "break-word"
  });

  copyButton.addEventListener("click", async () => {
    setDialogStatus(status, "Copying image to clipboard...");

    try {
      await copyCaptureToClipboard(capture.dataUrl);
      setDialogStatus(status, "Image copied to clipboard.");
    } catch (error) {
      setDialogStatus(status, `Copy failed: ${error.message}`);
    }
  });

  downloadButton.addEventListener("click", async () => {
    setDialogStatus(status, "Preparing download...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_CAPTURE",
        dataUrl: capture.dataUrl,
        filename: capture.filename
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Download failed.");
      }

      setDialogStatus(status, "Download started.");
    } catch (error) {
      setDialogStatus(status, `Download failed: ${error.message}`);
    }
  });

  closeButton.addEventListener("click", () => {
    removeActionDialog();
  });

  actionDialogElement.addEventListener("click", (event) => {
    if (event.target === actionDialogElement) {
      removeActionDialog();
    }
  });

  buttonRow.append(copyButton, downloadButton, closeButton);
  dialog.append(title, copy, preview, buttonRow, status);
  actionDialogElement.appendChild(dialog);
  document.documentElement.appendChild(actionDialogElement);
}

function removeActionDialog() {
  actionDialogElement?.remove();
  actionDialogElement = null;
}

function createDialogButton(label, isPrimary, isGhost = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  Object.assign(button.style, {
    appearance: "none",
    border: isGhost ? "1px solid rgba(47, 33, 22, 0.15)" : "0",
    borderRadius: "999px",
    padding: "11px 16px",
    cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    fontWeight: "700",
    transition: "transform 0.14s ease, box-shadow 0.14s ease"
  });

  if (isPrimary) {
    button.style.background = "linear-gradient(135deg, #1f1a17, #49392e)";
    button.style.color = "#fffaf4";
    button.style.boxShadow = "0 12px 28px rgba(38, 26, 17, 0.24)";
  } else if (isGhost) {
    button.style.background = "#fff8f1";
    button.style.color = "#33241c";
  } else {
    button.style.background = "#efe1d2";
    button.style.color = "#2d211b";
  }

  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-1px)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0)";
  });

  return button;
}

async function copyCaptureToClipboard(dataUrl) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image copy is not supported here.");
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const item = new ClipboardItem({
    [blob.type]: blob
  });

  await navigator.clipboard.write([item]);
}

function setDialogStatus(element, text) {
  element.textContent = text;
}
