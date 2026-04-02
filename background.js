chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_ELEMENT") {
    captureElement(message.rect, sender.tab?.windowId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "DOWNLOAD_CAPTURE") {
    downloadCapture(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "CAPTURE_VIEWPORT") {
    captureViewport(sender.tab?.windowId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "OPEN_SHORTCUTS_PAGE") {
    openShortcutsPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "start-picker") {
    return;
  }

  try {
    await startPickerOnActiveTab();
  } catch (error) {
    console.error("Shortcut could not start the picker:", error);
  }
});

async function captureElement(rect, windowId) {
  if (!rect) {
    throw new Error("No element bounds were provided.");
  }

  const imageUrl = await captureVisibleTab(windowId);
  const bitmap = await createImageBitmapFromDataUrl(imageUrl);
  const scale = rect.devicePixelRatio || 1;
  const rawLeft = rect.left * scale;
  const rawTop = rect.top * scale;
  const rawRight = (rect.left + rect.width) * scale;
  const rawBottom = (rect.top + rect.height) * scale;

  const cropLeft = Math.max(0, Math.floor(rawLeft));
  const cropTop = Math.max(0, Math.floor(rawTop));
  const cropRight = Math.min(bitmap.width, Math.ceil(rawRight));
  const cropBottom = Math.min(bitmap.height, Math.ceil(rawBottom));
  const cropWidth = cropRight - cropLeft;
  const cropHeight = cropBottom - cropTop;

  if (cropWidth <= 0 || cropHeight <= 0) {
    throw new Error("The selected element is outside the visible viewport.");
  }

  const outputCanvas = new OffscreenCanvas(cropWidth, cropHeight);
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("Could not create the output canvas.");
  }

  outputContext.drawImage(
    bitmap,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  const blob = await outputCanvas.convertToBlob({ type: "image/png" });
  const dataUrl = await blobToDataUrl(blob);
  const filename = `element-screenshot-${Date.now()}.png`;

  return {
    filename,
    dataUrl
  };
}

async function createImageBitmapFromDataUrl(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function captureViewport(windowId) {
  const dataUrl = await captureVisibleTab(windowId);

  return {
    dataUrl,
    filename: `viewport-screenshot-${Date.now()}.png`
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the blob."));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function downloadCapture(message) {
  if (!message?.dataUrl || !message?.filename) {
    throw new Error("Download data is incomplete.");
  }

  const downloadId = await chrome.downloads.download({
    url: message.dataUrl,
    filename: message.filename,
    saveAs: true
  });

  return { downloadId };
}

async function captureVisibleTab(windowId) {
  return chrome.tabs.captureVisibleTab(windowId, {
    format: "png"
  });
}

async function openShortcutsPage() {
  await chrome.tabs.create({
    url: "chrome://extensions/shortcuts"
  });
}

async function startPickerOnActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  if (!tab?.id) {
    throw new Error("Could not find the active tab.");
  }

  await chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" });
}
