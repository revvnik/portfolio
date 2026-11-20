// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  JohnnyMachine, RAM_SIZE, WORD_MAX, MICRO_SIZE, SLOTS_PER_INSTRUCTION,
  blankRam, defaultMicrocode, formatWord, microName, opcodeOf, operandOf,
  operations, pad, parseMicrocode, parseRam, readWord, standardHelp
} from "./machine.js";
import { wireDiagram } from "./diagram.js";

const oldSlideIds = new Set([
  "slide-1", "ministry-section", "slide-2", "slide-3", "slide-4", "high-tech-agenda",
  "my-it-work", "slide-5", "slide-6", "networking", "apprenticeship"
]);

function redirectOldSlide() {
  if (!oldSlideIds.has(location.hash.slice(1))) return false;
  location.replace("./presentation/" + location.hash);
  return true;
}

window.addEventListener("hashchange", redirectOldSlide);
if (!redirectOldSlide()) startSimulator();

function startSimulator() {
  const byId = (id) => document.getElementById(id);
  const storageKey = (name) => "atiw-johnny:" + name;
  const read = (name, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(storageKey(name))) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const store = (name, value) => {
    try {
      localStorage.setItem(storageKey(name), JSON.stringify(value));
    } catch {
      // The simulator remains usable when browser storage is unavailable.
    }
  };

  const preferences = {
    fixRAM: true,
    fixRamEq: false,
    useDeleteForDeleteRow: false,
    setFilenameOnSave: true,
    linesAheadTop: 1,
    linesAheadBottom: 5,
    historyMaxLength: 30,
    mode: "standard",
    controlVisible: true,
    manualVisible: false,
    delay: 1300,
    ...read("preferences", {})
  };
  const cpu = new JohnnyMachine(read("ram", blankRam()), read("microcode", defaultMicrocode(preferences.mode)));
  let selected = 0;
  let phase = "ready";
  let timer;
  let recording;
  let installPrompt;
  const undoStack = [];
  const redoStack = [];
  const dirtyWords = new Set();

  const ramInput = byId("ramInput");
  const commandSelect = byId("commandSelect");
  const speed = byId("speed");
  const lastAction = byId("lastAction");
  const stateBadge = byId("executionStatus");
  const prompt = byId("prompt");
  const ramTools = byId("ramTools");
  const commandDialog = byId("commandDialog");
  const recordDialog = byId("recordDialog");
  const recordPanel = byId("recordPanel");
  const machine = byId("machine");
  const showPane = wireDiagram();
  const ramRows = makeRows(byId("ramRows"), RAM_SIZE, 3, "address");
  const mcRows = makeRows(byId("mcRows"), MICRO_SIZE, 2, "micro");
  const microButtons = mcRows.map((row, address) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.editMicro = address;
    button.tabIndex = address === 0 ? 0 : -1;
    row.cells[1].append(button);
    return button;
  });
  const operationButtons = new Map([...machine.querySelectorAll("[data-op]")]
    .map((button) => [Number(button.dataset.op), button]));
  const flashTimers = new WeakMap();
  const standardCode = defaultMicrocode();
  const wires = {
    1: "dataToRam", 2: "ramToData", 3: "dataToIr", 4: "irToAddress",
    5: "irToMc", 8: "pcToAddress", 10: "zeroToPc", 11: "irToPc",
    13: "dataToAcc", 14: "dataToAcc", 15: "accToData", 18: "dataToAcc"
  };

  function makeRows(body, length, columns, datasetKey) {
    const fragment = document.createDocumentFragment();
    const rows = Array.from({ length }, (_, address) => {
      const row = document.createElement("tr");
      row.dataset[datasetKey] = address;
      for (let column = 0; column < columns; column++) row.insertCell();
      row.cells[0].textContent = pad(address);
      fragment.append(row);
      return row;
    });
    body.append(fragment);
    return rows;
  }

  function notify(message) {
    if (lastAction.textContent !== message) {
      lastAction.textContent = message;
      lastAction.title = message;
    }
    for (const [dialog, id] of [[ramTools, "ramToolStatus"], [recordDialog, "recordStatus"], [commandDialog, "commandStatus"]]) {
      if (dialog.open) {
        const status = byId(id);
        status.hidden = false;
        status.textContent = message;
      }
    }
  }

  function setPhase(next) {
    phase = next;
    stateBadge.dataset.state = next;
    stateBadge.textContent = {
      ready: "Ready", running: "Running", paused: "Paused", halted: "Halted", error: "Stopped"
    }[next];
    byId("runLabel").textContent = next === "paused" ? "Resume" : "Run";
    byId("run").disabled = next === "running";
    byId("pause").disabled = next !== "running";
    byId("step").disabled = next === "running" || next === "halted" || next === "error";
    byId("microstep").disabled = byId("step").disabled;
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function renderRamWord(address) {
    const word = cpu.ram[address];
    const opcode = opcodeOf(word);
    const name = opcode ? microName(cpu.microcode, opcode) : "";
    const cells = ramRows[address].cells;
    cells[1].textContent = formatWord(word);
    cells[2].textContent = name ? name + " " + pad(operandOf(word)) : "";
  }

  function renderRam() {
    for (let i = 0; i < RAM_SIZE; i++) renderRamWord(i);
  }

  function renderMicroWord(address) {
    const op = operations[cpu.microcode[address]] || operations[0];
    const button = microButtons[address];
    button.textContent = op[0];
    button.title = op[1];
    button.setAttribute("aria-label", "Edit micro-operation " + pad(address) + ", " + op[0]);
  }

  function renderMicrocode() {
    const previous = commandSelect.value;
    commandSelect.replaceChildren(new Option("Instruction", ""));
    const instructionList = byId("instructionList");
    instructionList.replaceChildren();
    for (let address = 0; address < MICRO_SIZE; address++) {
      renderMicroWord(address);
      if (address % SLOTS_PER_INSTRUCTION !== 0) continue;

      const opcode = address / SLOTS_PER_INSTRUCTION;
      const name = microName(cpu.microcode, opcode);
      const cell = mcRows[address].cells[0];
      cell.textContent = pad(address);
      if (!name) continue;
      cell.textContent = "";
      const label = pad(address) + "  " + name;
      if (opcode) {
        const rename = document.createElement("button");
        rename.type = "button";
        rename.dataset.rename = opcode;
        rename.textContent = label;
        rename.title = "Rename " + name;
        cell.append(rename);
        commandSelect.add(new Option(pad(opcode, 2) + " " + name, opcode));
      } else {
        cell.textContent = label;
      }

      const term = document.createElement("dt");
      const meaning = document.createElement("dd");
      term.textContent = pad(opcode, 2) + " " + name;
      const original = microName(standardCode, opcode) === name && cpu.microcode
        .slice(address, address + SLOTS_PER_INSTRUCTION).every((code, step) => code === standardCode[address + step]);
      meaning.textContent = original ? standardHelp[opcode] : "See the microcode at address " + pad(address) + ".";
      instructionList.append(term, meaning);
    }
    commandSelect.value = previous;
    if (commandSelect.selectedIndex === -1) commandSelect.selectedIndex = 0;
  }

  function revealRow(row, scroller, aheadTop = 0, aheadBottom = 0) {
    if (!scroller.clientHeight) return;
    const bounds = scroller.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    const header = scroller.querySelector("thead").offsetHeight;
    const top = bounds.top + header + aheadTop * rect.height;
    const bottom = bounds.bottom - aheadBottom * rect.height;
    if (rect.top < top) scroller.scrollTop += rect.top - top;
    else if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
  }

  function editSelection() {
    const word = cpu.ram[selected];
    const opcode = opcodeOf(word);
    ramInput.value = formatWord(word);
    commandSelect.value = microName(cpu.microcode, opcode) && opcode ? opcode : "";
    byId("editorAddress").textContent = pad(selected);
  }

  function selectRam(address, { focus = false, reveal = true } = {}) {
    ramRows[selected].classList.remove("is-selected");
    ramRows[selected].tabIndex = -1;
    ramRows[selected].removeAttribute("aria-selected");
    selected = Math.max(0, Math.min(RAM_SIZE - 1, address));
    const row = ramRows[selected];
    row.classList.add("is-selected");
    row.setAttribute("aria-selected", "true");
    row.tabIndex = 0;
    editSelection();
    if (reveal) revealRow(row, byId("ramScroll"), preferences.linesAheadTop, preferences.linesAheadBottom);
    if (focus) (ramTools.open ? ramInput : row).focus({ preventScroll: true });
  }

  let previousPc;
  let previousMc;
  let previousAccess;
  function renderCpu() {
    const address = pad(cpu.address);
    const data = pad(cpu.data, 5);
    const zero = cpu.acc === 0;

    byId("addressValue").textContent = address;
    byId("dataValue").textContent = data;
    byId("accValue").textContent = pad(cpu.acc, 5);
    byId("zeroFlag").dataset.active = zero;
    byId("zeroValue").textContent = zero ? "1" : "0";
    byId("irOpcode").textContent = pad(opcodeOf(cpu.ir), 2);
    byId("irOperand").textContent = pad(operandOf(cpu.ir));
    byId("pcValue").textContent = pad(cpu.pc);
    byId("mcValue").textContent = pad(cpu.mc);

    if (previousPc !== cpu.pc) {
      ramRows[previousPc]?.classList.remove("is-pc");
      ramRows[previousPc]?.removeAttribute("aria-current");
      ramRows[cpu.pc].classList.add("is-pc");
      ramRows[cpu.pc].setAttribute("aria-current", "true");
      previousPc = cpu.pc;
      if (document.activeElement !== ramInput && document.activeElement !== commandSelect) {
        revealRow(ramRows[cpu.pc], byId("ramScroll"));
      }
    }
    if (previousMc !== cpu.mc) {
      if (previousMc !== undefined) {
        mcRows[previousMc].classList.remove("is-current");
        mcRows[previousMc].removeAttribute("aria-current");
        if (document.activeElement !== microButtons[previousMc]) microButtons[previousMc].tabIndex = -1;
      }
      mcRows[cpu.mc].classList.add("is-current");
      mcRows[cpu.mc].setAttribute("aria-current", "true");
      microButtons[cpu.mc].tabIndex = 0;
      previousMc = cpu.mc;
      revealRow(mcRows[cpu.mc], byId("mcScroll"));
    }
    if (previousAccess !== cpu.access) {
      ramRows[previousAccess]?.classList.remove("is-access");
      ramRows[cpu.access]?.classList.add("is-access");
      previousAccess = cpu.access;
    }
    if (dirtyWords.size) {
      for (const word of dirtyWords) renderRamWord(word);
      if (dirtyWords.has(selected) && document.activeElement !== ramInput) editSelection();
      store("ram", cpu.ram);
      dirtyWords.clear();
    }
  }

  function flash(code) {
    const path = wires[code] ? byId(wires[code]) : null;
    const addressWire = code === 1 || code === 2 ? byId("addressToRam") : null;
    for (const element of [operationButtons.get(code), path, addressWire]) {
      if (!element) continue;
      clearTimeout(flashTimers.get(element));
      element.dataset.active = "true";
      flashTimers.set(element, setTimeout(() => delete element.dataset.active, 700));
    }
  }

  function resetCpu(message = "CPU reset. RAM and microcode are ready.") {
    stopTimer();
    for (const element of machine.querySelectorAll(".operation[data-active], .wire[data-active]")) {
      clearTimeout(flashTimers.get(element));
      delete element.dataset.active;
    }
    cpu.reset();
    setPhase("ready");
    renderCpu();
    byId("ramScroll").scrollTop = 0;
    byId("mcScroll").scrollTop = 0;
    selectRam(0);
    if (message) notify(message);
  }

  function fail(error) {
    stopTimer();
    cpu.halted = true;
    setPhase("error");
    renderCpu();
    notify(error.message + " Reset the CPU to start again.");
  }

  function operationApplied(code) {
    if (code === 1) dirtyWords.add(cpu.address);
    if (recording) captureOperation(code);
  }

  function performOperation(code) {
    const wasRecording = Boolean(recording);
    cpu.apply(code);
    operationApplied(code);
    if (code === 19) {
      stopTimer();
      setPhase("halted");
    }
    renderCpu();
    flash(code);
    if (!wasRecording || recording) notify(operations[code][1] + ".");
  }

  function runMicrostep() {
    if (phase === "running" || cpu.halted) return;
    try {
      const address = cpu.mc;
      const code = cpu.stepMicro();
      operationApplied(code);
      setPhase(cpu.halted ? "halted" : "paused");
      renderCpu();
      flash(code);
      notify("Microcode " + pad(address) + " · " + operations[code][1] + ".");
    } catch (error) {
      fail(error);
    }
  }

  function executeInstruction() {
    const address = cpu.pc;
    let signal;
    let count = 0;
    do {
      if (count++ >= MICRO_SIZE) throw new Error("The microcode did not return to FETCH.");
      const code = cpu.stepMicro();
      operationApplied(code);
      if (code !== 7 && code !== 9) signal = code;
    } while (cpu.mc !== 0 && !cpu.halted);
    if (cpu.halted) cpu.mc = 0;

    const opcode = opcodeOf(cpu.ir);
    const name = microName(cpu.microcode, opcode) || pad(opcode, 2);
    const operation = [name, name === "HLT" ? "" : pad(operandOf(cpu.ir))].filter(Boolean).join(" ");
    const action = cpu.halted ? "Halted at " + pad(address) + "." : "Executed " + operation + " at " + pad(address) + ".";
    return { address, signal, action };
  }

  function runInstruction() {
    if (phase === "running" || cpu.halted) return;
    try {
      const result = executeInstruction();
      setPhase(cpu.halted ? "halted" : "paused");
      renderCpu();
      if (result.signal !== undefined) flash(result.signal);
      notify(result.action);
    } catch (error) {
      fail(error);
    }
  }

  function tick() {
    if (phase !== "running") return;
    try {
      const iterations = preferences.delay === 0 ? 16 : 1;
      let result;
      let sameAddress = false;
      for (let i = 0; i < iterations; i++) {
        result = executeInstruction();
        sameAddress = result.address === cpu.pc && !cpu.halted;
        if (cpu.halted || sameAddress) break;
      }
      renderCpu();
      if (result.signal !== undefined && iterations === 1) flash(result.signal);
      if (cpu.halted) {
        setPhase("halted");
        notify(result.action);
      } else if (sameAddress) {
        setPhase("paused");
        notify(cpu.ir === 0
          ? "RAM " + pad(cpu.pc) + " is empty. Load an example or enter an instruction."
          : "Paused at " + pad(cpu.pc) + " because the program counter did not advance.");
      } else {
        notify(result.action);
        timer = setTimeout(tick, preferences.delay);
      }
    } catch (error) {
      fail(error);
    }
  }

  function run(restart = false) {
    if (phase === "running" && !restart) return;
    if (restart || cpu.halted) resetCpu("");
    setPhase("running");
    tick();
  }

  function pause() {
    if (phase === "paused") return run();
    if (phase !== "running") return;
    stopTimer();
    setPhase("paused");
    notify("Paused at address " + pad(cpu.pc) + ".");
  }

  function updateSpeed() {
    preferences.delay = 3000 - Number(speed.value);
    byId("speedValue").textContent = preferences.delay ? (preferences.delay / 1000).toFixed(2) + " s" : "Turbo";
    speed.setAttribute("aria-valuetext", preferences.delay ? preferences.delay + " milliseconds between instructions" : "Turbo");
    store("preferences", preferences);
    if (phase === "running") {
      stopTimer();
      timer = setTimeout(tick, preferences.delay);
    }
  }

  function applyControlView(visible) {
    preferences.controlVisible = visible;
    byId("controlVisible").checked = visible;
    byId("controlBody").hidden = !visible;
    byId("controlOff").hidden = visible;
    machine.dataset.control = visible;
    if (visible) revealRow(mcRows[cpu.mc], byId("mcScroll"));
    store("preferences", preferences);
  }

  function applyManualView(visible) {
    preferences.manualVisible = visible;
    byId("manualVisible").checked = visible;
    machine.dataset.manual = visible;
    store("preferences", preferences);
  }

  function openRamEditor() {
    showPane("memory");
    if (!ramTools.open) {
      byId("ramToolStatus").hidden = true;
      ramTools.showModal();
    }
    ramInput.focus({ preventScroll: true });
    ramInput.select();
  }

  function updateHistory() {
    for (const [action, stack] of [["undo", undoStack], ["redo", redoStack]]) {
      for (const button of document.querySelectorAll('[data-action="' + action + '"]')) {
        button.disabled = !stack.length || Boolean(recording);
      }
    }
  }

  function remember(entry) {
    undoStack.push(entry);
    if (undoStack.length > preferences.historyMaxLength) undoStack.splice(0, undoStack.length - preferences.historyMaxLength);
    redoStack.length = 0;
    updateHistory();
  }

  function stepHistory(from, to, direction) {
    if (recording) return notify("Finish recording before changing the edit history.");
    const entry = from.pop();
    if (!entry) return;
    entry[direction]();
    to.push(entry);
    updateHistory();
    notify((direction === "undo" ? "Undid " : "Redid ") + entry.label + ".");
  }

  function changeRamWord(address, value) {
    cpu.ram[address] = value;
    dirtyWords.add(address);
    renderCpu();
  }

  function writeRam() {
    const address = selected;
    const oldValue = cpu.ram[address];
    const word = readWord(ramInput.value);
    changeRamWord(address, word);
    selectRam(address + 1);
    if (oldValue !== word) {
      remember({
        label: "RAM edit",
        undo() { changeRamWord(address, oldValue); selectRam(address); },
        redo() { changeRamWord(address, word); selectRam(address + 1); }
      });
    }
    notify("Wrote " + formatWord(word) + " to RAM " + pad(address) + ".");
  }

  function applyRam(ram, address) {
    cpu.ram = ram.slice();
    store("ram", cpu.ram);
    renderRam();
    selectRam(address);
  }

  function replaceRam(ram, address, label) {
    const before = cpu.ram.slice();
    const beforeAddress = selected;
    applyRam(ram, address);
    remember({
      label,
      undo() { applyRam(before, beforeAddress); },
      redo() { applyRam(ram, address); }
    });
  }

  function shiftOperands(ram, address, end, delta) {
    if (!preferences.fixRAM) return;
    for (let i = 0; i < RAM_SIZE; i++) {
      const word = ram[i];
      const opcode = opcodeOf(word);
      const operand = operandOf(word);
      const name = microName(cpu.microcode, opcode);
      const inRange = operand <= end && (operand > address || (preferences.fixRamEq && operand === address));
      if (opcode && name && name !== "HLT" && inRange) {
        ram[i] = opcode * RAM_SIZE + Math.max(0, Math.min(RAM_SIZE - 1, operand + delta));
      }
    }
  }

  function insertRow() {
    const next = cpu.ram.slice();
    const empty = next.lastIndexOf(0);
    if (empty < Math.max(selected, 900)) {
      notify("Free a word near the end of RAM before inserting a row.");
      return;
    }
    next.splice(empty, 1);
    next.splice(selected, 0, 0);
    shiftOperands(next, selected, empty - 1, 1);
    replaceRam(next, selected, "row insertion");
    notify("Inserted a word at RAM " + pad(selected) + ".");
  }

  function deleteRow() {
    const next = cpu.ram.slice();
    next.splice(selected, 1);
    next.push(0);
    shiftOperands(next, selected, RAM_SIZE - 1, -1);
    replaceRam(next, selected, "row deletion");
    notify("Deleted the word at RAM " + pad(selected) + ".");
  }

  function applyMicrocode(code, mode) {
    cpu.microcode = code.slice();
    preferences.mode = mode;
    byId("mode").value = mode;
    machine.dataset.mode = mode;
    renderMicrocode();
    renderRam();
    editSelection();
    store("microcode", cpu.microcode);
    store("preferences", preferences);
  }

  function saveMicroEdit(before, beforeMode, label) {
    const after = cpu.microcode.slice();
    const afterMode = preferences.mode;
    remember({
      label,
      undo() { applyMicrocode(before, beforeMode); },
      redo() { applyMicrocode(after, afterMode); }
    });
  }

  function replaceMicrocode(code, mode, label) {
    const before = cpu.microcode.slice();
    const beforeMode = preferences.mode;
    applyMicrocode(code, mode);
    saveMicroEdit(before, beforeMode, label);
  }

  function ask(title, { message, button = "OK", field } = {}) {
    if (prompt.open) return Promise.resolve(null);
    byId("promptTitle").textContent = title;
    const description = byId("promptMessage");
    description.textContent = message ?? "";
    description.hidden = !message;
    const fieldBox = byId("promptField");
    fieldBox.replaceChildren();
    fieldBox.hidden = !field;
    if (field) fieldBox.append(field);
    byId("promptSubmit").textContent = button;
    prompt.returnValue = "";
    return new Promise((resolve) => {
      prompt.addEventListener("close", () => {
        resolve(prompt.returnValue === "ok" ? field?.value ?? true : null);
      }, { once: true });
      prompt.showModal();
      (field || byId("promptCancel")).focus();
      if (field?.tagName === "INPUT") field.select();
    });
  }

  function inputField(label, value) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.autocomplete = "off";
    input.required = true;
    input.setAttribute("aria-label", label);
    return input;
  }

  async function editMicrocode(address) {
    if (recording) return notify("Finish recording before editing microcode.");
    const field = document.createElement("select");
    field.setAttribute("aria-label", "Micro-operation");
    for (const [code, [name]] of Object.entries(operations)) {
      field.add(new Option(pad(code, 2) + " · " + name, code));
    }
    field.value = cpu.microcode[address];
    const value = await ask("Edit microcode " + pad(address), { field, button: "Save operation" });
    if (value === null || Number(value) === cpu.microcode[address]) return;
    const before = cpu.microcode.slice();
    cpu.microcode[address] = Number(value);
    renderMicroWord(address);
    store("microcode", cpu.microcode);
    saveMicroEdit(before, preferences.mode, "microcode edit");
    notify("Updated microcode " + pad(address) + ".");
  }

  async function renameInstruction(opcode) {
    if (recording) return notify("Finish recording before renaming instructions.");
    const oldName = microName(cpu.microcode, opcode);
    const field = inputField("Instruction name", oldName);
    field.maxLength = 24;
    const value = await ask("Rename " + oldName, { field, button: "Rename" });
    if (value === null) return;
    const name = value.trim().toUpperCase();
    if (!name || name === oldName) return;
    if (cpu.microcode.slice(MICRO_SIZE).includes(name)) return notify("That instruction name is already in use.");
    const code = cpu.microcode.slice();
    code[MICRO_SIZE + opcode] = name;
    replaceMicrocode(code, preferences.mode, "instruction rename");
    notify("Renamed " + oldName + " to " + name + ".");
  }

  function openRecorder() {
    if (recording || recordDialog.open) return;
    byId("recordStatus").hidden = true;
    recordDialog.showModal();
    byId("recordName").focus();
  }

  async function startRecording() {
    if (recording) return;
    const opcode = Number(byId("recordOpcode").value);
    const name = byId("recordName").value.trim().toUpperCase();
    if (!recordPanel.reportValidity()) return;
    const names = cpu.microcode.slice(MICRO_SIZE);
    if (names.some((existing, index) => existing === name && index !== opcode)) {
      return notify("That instruction name is already in use at another opcode.");
    }
    const start = opcode * SLOTS_PER_INSTRUCTION;
    if (microName(cpu.microcode, opcode) || cpu.microcode.slice(start, start + SLOTS_PER_INSTRUCTION).some(Boolean)) {
      const answer = await ask("Replace opcode " + pad(opcode, 2) + "?", {
        message: "The operations at this opcode will be replaced.",
        button: "Replace opcode"
      });
      if (!answer) return;
    }
    if (phase === "running") pause();
    recording = { before: cpu.microcode.slice(), name, start, offset: 0 };
    recordDialog.close();
    applyControlView(true);
    applyManualView(true);
    showPane("control");
    cpu.microcode.fill(0, start, start + SLOTS_PER_INSTRUCTION);
    cpu.microcode[MICRO_SIZE + opcode] = name;
    byId("microToolsButton").hidden = true;
    byId("finishRecording").hidden = false;
    renderMicrocode();
    revealRow(mcRows[start], byId("mcScroll"));
    updateHistory();
    notify("Recording " + name + ". Choose micro-operations in the diagram.");
  }

  function captureOperation(code) {
    const address = recording.start + recording.offset++;
    cpu.microcode[address] = code;
    renderMicroWord(address);
    revealRow(mcRows[address], byId("mcScroll"));
    if (recording.offset === SLOTS_PER_INSTRUCTION) finishRecording();
  }

  function finishRecording() {
    if (!recording) return;
    const { before, name, offset } = recording;
    recording = undefined;
    byId("finishRecording").hidden = true;
    byId("microToolsButton").hidden = false;
    if (!offset) {
      applyMicrocode(before, preferences.mode);
      updateHistory();
      notify("Recording ended without operations.");
      return;
    }
    applyMicrocode(cpu.microcode, preferences.mode);
    saveMicroEdit(before, preferences.mode, "microcode recording");
    notify("Recorded " + name + " with " + offset + (offset === 1 ? " operation." : " operations."));
  }

  async function clearRam() {
    if (!cpu.ram.some(Boolean)) return notify("RAM is already empty.");
    if (!await ask("Clear RAM?", { message: "All 1,000 RAM words will be set to zero. You can undo this edit.", button: "Clear RAM" })) return;
    resetCpu("");
    replaceRam(blankRam(), 0, "RAM clear");
    notify("RAM cleared.");
  }

  async function restoreCode(mode = preferences.mode) {
    if (recording) return notify("Finish recording before resetting microcode.");
    if (!await ask("Load " + (mode === "bonsai" ? "Bonsai" : "standard") + " microcode?", {
      message: "This replaces the current microcode. You can undo this edit.",
      button: "Load microcode"
    })) return;
    resetCpu("");
    replaceMicrocode(defaultMicrocode(mode), mode, "microcode reset");
    notify((mode === "bonsai" ? "Bonsai" : "Standard") + " microcode loaded.");
  }

  async function loadExample() {
    if (cpu.ram.some(Boolean) && !await ask("Load the example?", {
      message: "The example replaces RAM. You can undo this edit.",
      button: "Load example"
    })) return;

    const values = blankRam();
    const bonsai = preferences.mode === "bonsai";
    values.splice(0, bonsai ? 3 : 4, ...(bonsai ? [1020, 1020, 5000] : [1020, 2021, 4022, 10000]));
    values[20] = 7;
    if (!bonsai) values[21] = 5;

    resetCpu("");
    replaceRam(values, 0, "example load");
    notify(bonsai ? "Example loaded. Increment RAM 020 twice to get 9." : "Example loaded. Add 7 + 5 and store the result in RAM 022.");
  }

  async function openFile(file, kind) {
    if (!file) return;
    const content = await file.text();
    if (kind === "ram") {
      const ram = parseRam(content);
      resetCpu("");
      replaceRam(ram, 0, "RAM import");
    } else {
      if (recording) return notify("Finish recording before opening a microcode file.");
      const code = parseMicrocode(content);
      const mode = code[MICRO_SIZE + 1] === "INC" && code[MICRO_SIZE + 5] === "HLT" ? "bonsai" : "standard";
      resetCpu("");
      replaceMicrocode(code, mode, "microcode import");
    }
    notify("Opened " + file.name + ".");
  }

  async function downloadFile(kind) {
    const data = kind === "ram" ? cpu.ram : cpu.microcode;
    let name = kind === "ram" ? "Ram.ram" : "Micro_code.mc";
    if (preferences.setFilenameOnSave) {
      const value = await ask("Save " + (kind === "ram" ? "RAM" : "microcode"), {
        field: inputField("Filename", name), button: "Download"
      });
      if (value === null || !value.trim()) return;
      name = value.trim();
      if (!name.toLowerCase().endsWith("." + kind)) name += "." + kind;
    }
    const href = URL.createObjectURL(new Blob([data.join("\r\n")], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    notify("Downloaded " + name + ".");
  }

  function setBus(which) {
    const input = byId(which + "Input");
    const value = input.value.trim();
    if (!/^\d+$/.test(value)) throw new Error("Enter a decimal number for the " + which + " bus.");
    cpu[which] = Math.min(Number(value), which === "address" ? RAM_SIZE - 1 : WORD_MAX);
    renderCpu();
    notify((which === "address" ? "Address" : "Data") + " bus set to " + cpu[which] + ".");
  }

  function enterCommand() {
    if (ramTools.open) ramTools.close();
    byId("commandStatus").hidden = true;
    commandDialog.showModal();
    byId("commandInput").focus();
  }

  function leaveCommand() {
    commandDialog.close();
  }

  function recordShortcut() {
    if (recording) return finishRecording();
    openRecorder();
  }

  const actions = {
    run: () => run(),
    pause,
    step: runInstruction,
    microstep: runMicrostep,
    reset: () => resetCpu(),
    example: loadExample,
    editRam: openRamEditor,
    openRam: () => byId("ramFile").click(),
    openMc: () => byId("mcFile").click(),
    saveRam: () => downloadFile("ram"),
    saveMc: () => downloadFile("mc"),
    clearRam,
    resetMc: () => restoreCode(),
    insert: insertRow,
    delete: deleteRow,
    undo: () => stepHistory(undoStack, redoStack, "undo"),
    redo: () => stepHistory(redoStack, undoStack, "redo"),
    showControl: () => applyControlView(true),
    openRecorder,
    finishRecording,
    command: enterCommand,
    install: async () => {
      if (!installPrompt) return;
      await installPrompt.prompt();
      installPrompt = undefined;
      byId("install").hidden = true;
    }
  };
  const commandOperations = {
    "a+": 16, "a++": 16, "a-": 17, "a--": 17, a0: 12, ar: 12,
    dr: 1, rd: 2, da: 18, p: 13, s: 14, ad: 15, di: 3,
    im: 5, ip: 11, ia: 4, pa: 8, "p+": 9, "p++": 9, "=0": 10, m0: 7, stop: 19, h: 19
  };
  const commandActions = {
    a: () => setBus("address"), d: () => setBus("data"), i: actions.insert, del: actions.delete,
    sr: actions.saveRam, sm: actions.saveMc, lr: actions.openRam, lm: actions.openMc,
    cr: actions.clearRam, cm: actions.resetMc, rec: recordShortcut, cnf: () => byId("settings").showModal()
  };

  function runCommand() {
    const command = byId("commandInput").value.trim().toLowerCase();
    if (!Object.hasOwn(commandOperations, command) && !Object.hasOwn(commandActions, command)) {
      notify("Unknown command “" + command + "”. See Guide for the command list.");
      return;
    }
    leaveCommand();
    if (Object.hasOwn(commandOperations, command)) performOperation(commandOperations[command]);
    else return commandActions[command]();
  }

  function invoke(action) {
    try {
      const result = action();
      result?.catch?.((error) => notify(error.message));
    } catch (error) {
      notify(error.message);
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button?.dataset.action) {
      button.closest("[popover]:popover-open")?.hidePopover();
      return invoke(actions[button.dataset.action]);
    }
    if (button?.dataset.op) return invoke(() => performOperation(Number(button.dataset.op)));
    if (button?.dataset.dialog) return byId(button.dataset.dialog).showModal();
    if (button?.hasAttribute("data-close")) return button.closest("dialog").close();
    if (button?.dataset.editMicro) return invoke(() => editMicrocode(Number(button.dataset.editMicro)));
    if (button?.dataset.rename) return invoke(() => renameInstruction(Number(button.dataset.rename)));
    if (event.target instanceof HTMLDialogElement) {
      const rect = event.target.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
    }
  });

  byId("ramRows").addEventListener("click", (event) => {
    const row = event.target.closest("[data-address]");
    if (row) selectRam(Number(row.dataset.address), { focus: true });
  });
  byId("ramRows").addEventListener("dblclick", (event) => {
    if (event.target.closest("[data-address]")) openRamEditor();
  });

  for (const [menuId, buttonId] of [["moreMenu", "moreButton"], ["microTools", "microToolsButton"]]) {
    const menu = byId(menuId);
    menu.addEventListener("toggle", (event) => {
      if (event.newState !== "open") return;
      const trigger = byId(buttonId).getBoundingClientRect();
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      menu.style.left = Math.max(8, Math.min(innerWidth - width - 8, trigger.right - width)) + "px";
      const below = trigger.bottom + 5;
      menu.style.top = Math.max(8, below + height <= innerHeight - 8 ? below : trigger.top - height - 5) + "px";
    });
  }
  commandDialog.addEventListener("close", () => { byId("commandInput").value = ""; });

  const forms = {
    ramEditor: writeRam,
    addressForm: () => setBus("address"),
    dataForm: () => setBus("data"),
    commandLine: runCommand,
    recordPanel: startRecording
  };
  for (const [id, action] of Object.entries(forms)) {
    byId(id).addEventListener("submit", (event) => {
      event.preventDefault();
      invoke(action);
    });
  }

  commandSelect.addEventListener("change", () => {
    if (!commandSelect.value) return;
    const text = ramInput.value.trim();
    const operand = text.includes(".") ? text.split(".").at(-1) : text;
    const number = /^\d+$/.test(operand) ? Number(operand) % RAM_SIZE : 0;
    ramInput.value = pad(commandSelect.value, 2) + "." + pad(number);
    ramInput.focus({ preventScroll: true });
  });

  for (const [id, kind] of [["ramFile", "ram"], ["mcFile", "mc"]]) {
    byId(id).addEventListener("change", (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      invoke(() => openFile(file, kind));
    });
  }

  byId("controlVisible").addEventListener("change", (event) => applyControlView(event.target.checked));
  byId("manualVisible").addEventListener("change", (event) => applyManualView(event.target.checked));
  speed.value = 3000 - preferences.delay;
  speed.addEventListener("input", updateSpeed);

  for (const key of ["fixRAM", "fixRamEq", "useDeleteForDeleteRow", "setFilenameOnSave", "linesAheadTop", "linesAheadBottom", "historyMaxLength"]) {
    const input = byId(key);
    const isBoolean = input.type === "checkbox";
    if (isBoolean) input.checked = preferences[key];
    else input.value = preferences[key];
    input.addEventListener("change", () => {
      if (isBoolean) preferences[key] = input.checked;
      else {
        preferences[key] = Math.max(Number(input.min), Math.min(Number(input.max), input.valueAsNumber || 0));
        input.value = preferences[key];
      }
      store("preferences", preferences);
    });
  }
  byId("mode").addEventListener("change", (event) => {
    const mode = event.target.value;
    event.target.value = preferences.mode;
    invoke(() => restoreCode(mode));
  });

  function focusField(id) {
    if (id === "ramInput") return openRamEditor();
    if (id === "addressInput" || id === "dataInput") applyManualView(true);
    const field = byId(id);
    field.focus();
    if (field.type === "text") field.select();
  }

  const shortcutActions = {
    e: () => run(true), p: actions.pause, r: actions.reset, s: actions.step, S: actions.microstep,
    u: () => applyControlView(!preferences.controlVisible),
    a: () => focusField("addressInput"), d: () => focusField("dataInput"), w: () => focusField("ramInput"),
    A: () => { openRecorder(); focusField("recordOpcode"); },
    N: () => { openRecorder(); focusField("recordName"); },
    Q: recordShortcut, ":": enterCommand, v: enterCommand,
    "+": () => { speed.valueAsNumber += 150; updateSpeed(); },
    "-": () => { speed.valueAsNumber -= 150; updateSpeed(); },
    Insert: actions.insert,
    ArrowUp: () => selectRam(selected - 1, { focus: true }),
    ArrowDown: () => selectRam(selected + 1, { focus: true }),
    k: () => selectRam(selected - 1, { focus: true }),
    j: () => selectRam(selected + 1, { focus: true })
  };
  const fileShortcuts = { o: actions.openRam, O: actions.openMc, s: actions.saveRam, S: actions.saveMc, z: actions.undo, y: actions.redo, Z: actions.redo };
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || document.querySelector("dialog[open]:not(#commandDialog, #ramTools, #recordDialog)")) return;
    const { target, key } = event;
    if (commandDialog.open) {
      if (event.ctrlKey && key === "c") {
        event.preventDefault();
        leaveCommand();
      }
      return;
    }
    if (recordDialog.open) {
      if (key === "Enter" && event.shiftKey) {
        event.preventDefault();
        invoke(startRecording);
      }
      return;
    }
    let action;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (Object.hasOwn(fileShortcuts, key)) action = fileShortcuts[key];
    } else if (event.altKey && /^c$/i.test(event.code.slice(-1))) {
      action = event.shiftKey ? actions.resetMc : actions.clearRam;
    } else if (!event.altKey) {
      if (target.matches("select, input[type=range], #mcScroll, #mcScroll *, [role=tab]")) return;
      if (ramTools.open && !["ArrowUp", "ArrowDown", "Delete", "Insert"].includes(key)) return;
      if (key === "Enter" && target.closest("[data-address]")) action = openRamEditor;
      else if (key === "Delete" && (event.shiftKey || preferences.useDeleteForDeleteRow)) action = actions.delete;
      else if (Object.hasOwn(shortcutActions, key)) action = shortcutActions[key];
    }
    if (action) {
      event.preventDefault();
      invoke(action);
    }
  });

  byId("mcScroll").addEventListener("keydown", (event) => {
    const address = Number(event.target.dataset.editMicro);
    if (!Number.isInteger(address) || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(MICRO_SIZE - 1, address + (event.key === "ArrowUp" ? -1 : 1)));
    microButtons[next].focus();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    byId("install").hidden = false;
  });
  window.addEventListener("appinstalled", () => { byId("install").hidden = true; });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});

  applyMicrocode(cpu.microcode, preferences.mode);
  applyControlView(preferences.controlVisible);
  applyManualView(preferences.manualVisible);
  selectRam(0, { reveal: false });
  renderCpu();
  updateSpeed();
}
