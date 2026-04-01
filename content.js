const overlayId = "__div_screenshot_overlay__";
const tooltipId = "__div_screenshot_tooltip__";
const actionDialogId = "__div_screenshot_action_dialog__";

let selectionActive = false;
let currentTarget = null;
let overlayElement = null;
let tooltipElement = null;
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
  if (selectionActive) {
    return;
  }

  removeActionDialog();
  selectionActive = true;
  ensureOverlay();
  ensureTooltip();

  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  updateTooltip("Bewege die Maus ueber ein Element und klicke zum Screenshot. ESC beendet.");
}

function stopPicker() {
  selectionActive = false;
  currentTarget = null;

  document.removeEventListener("mousemove", handleMouseMove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);

  overlayElement?.remove();
  tooltipElement?.remove();
  overlayElement = null;
  tooltipElement = null;
}

function handleMouseMove(event) {
  if (!selectionActive) {
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
  if (!selectionActive) {
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
    updateTooltip("Screenshot wird erstellt...");
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
      throw new Error(response?.error || "Unbekannter Fehler");
    }

    stopPicker();
    showActionDialog(response);
  } catch (error) {
    setPickerVisibility(true);
    renderHighlight(rect);
    updateTooltip(`Fehler: ${error.message}`);
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    stopPicker();
  }
}

function getSelectableTarget(clientX, clientY) {
  overlayElement.style.pointerEvents = "none";
  tooltipElement.style.pointerEvents = "none";
  const target = document.elementFromPoint(clientX, clientY);
  overlayElement.style.pointerEvents = "none";
  tooltipElement.style.pointerEvents = "none";

  if (!target || target === document.documentElement || target === document.body) {
    return null;
  }

  return target;
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
    maxWidth: "320px",
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

function updateTooltip(text) {
  if (tooltipElement) {
    tooltipElement.textContent = text;
  }
}

function setPickerVisibility(isVisible) {
  if (overlayElement) {
    overlayElement.style.display = isVisible ? "block" : "none";
  }

  if (tooltipElement) {
    tooltipElement.style.display = isVisible ? "block" : "none";
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
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
  title.textContent = "Screenshot bereit";
  Object.assign(title.style, {
    margin: "0 0 10px",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "24px",
    lineHeight: "1.1"
  });

  const copy = document.createElement("p");
  copy.textContent = "Du kannst das Bild jetzt kopieren oder als PNG herunterladen.";
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

  const copyButton = createDialogButton("Bild kopieren", false);
  const downloadButton = createDialogButton("Download", true);
  const closeButton = createDialogButton("Schliessen", false, true);

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
    setDialogStatus(status, "Kopiere Bild in die Zwischenablage...");

    try {
      await copyCaptureToClipboard(capture.dataUrl);
      setDialogStatus(status, "Bild wurde in die Zwischenablage kopiert.");
    } catch (error) {
      setDialogStatus(status, `Kopieren fehlgeschlagen: ${error.message}`);
    }
  });

  downloadButton.addEventListener("click", async () => {
    setDialogStatus(status, "Download wird vorbereitet...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_CAPTURE",
        dataUrl: capture.dataUrl,
        filename: capture.filename
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Download fehlgeschlagen.");
      }

      setDialogStatus(status, "Download gestartet.");
    } catch (error) {
      setDialogStatus(status, `Download fehlgeschlagen: ${error.message}`);
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
    throw new Error("Die Zwischenablage unterstuetzt hier kein Bild-Kopieren.");
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
