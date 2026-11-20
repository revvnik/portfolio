// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on Johnny 2.0. Copyright (C) 2019, 2021 David Laubersheimer.
// Microcode and behavior based on the TobisMa edition. See README.md.

export const RAM_SIZE = 1000;
export const WORD_MAX = 19999;
export const MICRO_SIZE = 200;
export const SLOTS_PER_INSTRUCTION = 10;
export const pad = (value, width = 3) => String(value).padStart(width, "0");

export const operations = {
  0: ["Empty", "No micro-operation"],
  1: ["Data → RAM", "Write the data bus value to the addressed RAM word"],
  2: ["RAM → Data", "Read the addressed RAM word onto the data bus"],
  3: ["Data → IR", "Copy the data bus value to the instruction register"],
  4: ["IR → Address", "Copy the instruction operand to the address bus"],
  5: ["IR → µPC", "Jump to the microcode for the instruction’s opcode"],
  6: ["Reserved", "Reserved microcode value"],
  7: ["µPC := 0", "Return to the first micro-operation of the fetch cycle"],
  8: ["PC → Address", "Copy the program counter to the address bus"],
  9: ["PC + 1", "Advance the program counter"],
  10: ["If zero, PC + 1", "Advance the program counter if the accumulator is zero"],
  11: ["IR → PC", "Copy the instruction operand to the program counter"],
  12: ["ACC := 0", "Clear the accumulator"],
  13: ["Add", "Add the data bus value to the accumulator"],
  14: ["Subtract", "Subtract the data bus value from the accumulator"],
  15: ["ACC → Data", "Copy the accumulator to the data bus"],
  16: ["ACC + 1", "Increment the accumulator"],
  17: ["ACC − 1", "Decrement the accumulator"],
  18: ["Data → ACC", "Copy the data bus value to the accumulator"],
  19: ["Halt", "Stop program execution"]
};

const fetchSequence = ["FETCH", [8, 2, 3, 5]];
const standardSequences = [
  fetchSequence,
  ["TAKE", [4, 2, 18, 9, 7]],
  ["ADD", [4, 2, 13, 9, 7]],
  ["SUB", [4, 2, 14, 9, 7]],
  ["SAVE", [4, 15, 1, 9, 7]],
  ["JMP", [11, 7]],
  ["TST", [4, 2, 18, 10, 9, 7]],
  ["INC", [4, 2, 18, 16, 15, 1, 9, 7]],
  ["DEC", [4, 2, 18, 17, 15, 1, 9, 7]],
  ["NULL", [4, 12, 15, 1, 9, 7]],
  ["HLT", [19, 7]]
];
const bonsaiSequences = [
  fetchSequence,
  ["INC", [4, 2, 18, 16, 15, 1, 9, 7]],
  ["DEC", [4, 2, 18, 17, 15, 1, 9, 7]],
  ["JMP", [11, 7]],
  ["TST", [4, 2, 18, 10, 9, 7]],
  ["HLT", [19, 7]]
];

export const standardHelp = [
  "Fetch the instruction at PC",
  "Load RAM[operand] into the accumulator",
  "Add RAM[operand] to the accumulator",
  "Subtract RAM[operand] from the accumulator",
  "Store the accumulator in RAM[operand]",
  "Jump to the operand address",
  "Load RAM[operand] and skip the next instruction if it is zero",
  "Increment RAM[operand]",
  "Decrement RAM[operand]",
  "Set RAM[operand] to zero",
  "Halt execution"
];

export function defaultMicrocode(mode = "standard") {
  const sequences = mode === "bonsai" ? bonsaiSequences : standardSequences;
  const code = Array(MICRO_SIZE).fill(0);
  sequences.forEach(([, steps], opcode) => {
    code.splice(opcode * SLOTS_PER_INSTRUCTION, steps.length, ...steps);
  });
  return code.concat(sequences.map(([name]) => name));
}

export const opcodeOf = (word) => Math.floor(word / RAM_SIZE);
export const operandOf = (word) => word % RAM_SIZE;
export const formatWord = (word) => pad(opcodeOf(word), 2) + "." + pad(operandOf(word));
export const blankRam = () => Array(RAM_SIZE).fill(0);
export const microName = (code, opcode) => code[MICRO_SIZE + opcode] || "";

export function readWord(value) {
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Math.min(Number(text), WORD_MAX);
  if (/^\d{0,2}\.\d{1,3}$/.test(text)) {
    const [high, low] = text.split(".");
    return Math.min(Number(high) * RAM_SIZE + Number(low), WORD_MAX);
  }
  throw new Error("Enter a RAM word such as 42 or 01.004.");
}

export function parseRam(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n?|\n/);
  while (lines.at(-1)?.trim() === "") lines.pop();
  if (lines.length > RAM_SIZE) throw new Error("A RAM file can hold up to 1,000 words.");
  const ram = blankRam();
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      ram[index] = readWord(line);
    } catch {
      throw new Error("Invalid RAM word on line " + (index + 1) + ".");
    }
  });
  return ram;
}

export function parseMicrocode(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n?|\n/);
  while (lines.at(-1)?.trim() === "") lines.pop();
  if (lines.length < MICRO_SIZE || lines.length > MICRO_SIZE + 20) {
    throw new Error("A microcode file needs 200 operations followed by up to 20 names.");
  }
  return lines.map((line, index) => {
    const value = line.trim();
    if (index >= MICRO_SIZE) return value;
    if (!/^\d+$/.test(value) || !Object.hasOwn(operations, Number(value))) {
      throw new Error("Invalid micro-operation on line " + (index + 1) + ".");
    }
    return Number(value);
  });
}

export class JohnnyMachine {
  constructor(ram = blankRam(), microcode = defaultMicrocode()) {
    this.ram = ram;
    this.microcode = microcode;
    this.reset();
  }

  reset() {
    this.address = 0;
    this.data = 0;
    this.acc = 0;
    this.ir = 0;
    this.pc = 0;
    this.mc = 0;
    this.halted = false;
    this.access = null;
  }

  apply(code) {
    switch (code) {
      case 1:
        this.ram[this.address] = this.data;
        this.access = this.address;
        break;
      case 2:
        this.data = this.ram[this.address];
        this.access = this.address;
        break;
      case 3:
        this.ir = this.data;
        break;
      case 4:
        this.address = operandOf(this.ir);
        break;
      case 5:
        this.mc = opcodeOf(this.ir) * SLOTS_PER_INSTRUCTION;
        break;
      case 7:
        this.mc = 0;
        break;
      case 8:
        this.address = this.pc;
        break;
      case 9:
        this.pc = Math.min(this.pc + 1, RAM_SIZE - 1);
        break;
      case 10:
        if (this.acc === 0) this.pc = Math.min(this.pc + 1, RAM_SIZE - 1);
        break;
      case 11:
        this.pc = operandOf(this.ir);
        break;
      case 12:
        this.acc = 0;
        break;
      case 13:
        this.acc = Math.min(this.acc + this.data, WORD_MAX);
        break;
      case 14:
        this.acc = Math.max(this.acc - this.data, 0);
        break;
      case 15:
        this.data = this.acc;
        break;
      case 16:
        this.acc = Math.min(this.acc + 1, WORD_MAX);
        break;
      case 17:
        this.acc = Math.max(this.acc - 1, 0);
        break;
      case 18:
        this.acc = this.data;
        break;
      case 19:
        this.halted = true;
        break;
      default:
        throw new Error("No operation at microcode address " + pad(this.mc) + ".");
    }
  }

  stepMicro() {
    const address = this.mc;
    const code = this.microcode[address];
    this.apply(code);
    if (code !== 5 && code !== 7) this.mc = (address + 1) % MICRO_SIZE;
    return code;
  }
}
