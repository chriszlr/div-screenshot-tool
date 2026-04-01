const pickButton = document.getElementById("pick-element");
const openShortcutsButton = document.getElementById("open-shortcuts");
const statusElement = document.getElementById("status");
const shortcutValueElement = document.getElementById("shortcut-value");

pickButton.addEventListener("click", async () => {
  setStatus("Starting selection mode...");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      throw new Error("Could not find the active tab.");
    }

    await chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" });
    setStatus("Move your mouse over the page and click the element you want.");
    window.close();
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
});

openShortcutsButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "OPEN_SHORTCUTS_PAGE" });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not open the shortcuts page.");
    }

    window.close();
  } catch (error) {
    setStatus("Please open chrome://extensions/shortcuts manually.");
  }
});

loadShortcutState();

function setStatus(text) {
  statusElement.textContent = text;
}

async function loadShortcutState() {
  try {
    const commands = await chrome.commands.getAll();
    const pickerCommand = commands.find((command) => command.name === "start-picker");

    if (!pickerCommand) {
      shortcutValueElement.textContent = "Not available";
      return;
    }

    shortcutValueElement.textContent = pickerCommand.shortcut || "No shortcut set yet";
  } catch (_error) {
    shortcutValueElement.textContent = "Could not load shortcut";
  }
}
