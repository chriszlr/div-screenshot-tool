const pickButton = document.getElementById("pick-element");
const openShortcutsButton = document.getElementById("open-shortcuts");
const statusElement = document.getElementById("status");
const shortcutValueElement = document.getElementById("shortcut-value");

pickButton.addEventListener("click", async () => {
  setStatus("Auswahlmodus wird gestartet...");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id) {
      throw new Error("Aktiver Tab konnte nicht gefunden werden.");
    }

    await chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" });
    setStatus("Fahre mit der Maus ueber die Seite und klicke auf das gewuenschte Element.");
    window.close();
  } catch (error) {
    setStatus(`Fehler: ${error.message}`);
  }
});

openShortcutsButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "OPEN_SHORTCUTS_PAGE" });

    if (!response?.ok) {
      throw new Error(response?.error || "Shortcut-Seite konnte nicht geoeffnet werden.");
    }

    window.close();
  } catch (error) {
    setStatus(`Shortcut-Seite bitte manuell oeffnen: chrome://extensions/shortcuts`);
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
      shortcutValueElement.textContent = "Nicht verfuegbar";
      return;
    }

    shortcutValueElement.textContent = pickerCommand.shortcut || "Noch kein Shortcut gesetzt";
  } catch (_error) {
    shortcutValueElement.textContent = "Shortcut konnte nicht geladen werden";
  }
}
