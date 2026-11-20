// SPDX-License-Identifier: AGPL-3.0-or-later

export function wireDiagram() {
  const machine = document.getElementById("machine");
  const board = document.getElementById("boardScroll");
  const sections = [...document.querySelectorAll("[data-pan]")].map((button) => ({
    button,
    lane: document.getElementById(button.dataset.pan)
  }));

  const byId = (id) => document.getElementById(id);
  const operation = (code) => machine.querySelector('[data-op="' + code + '"]');

  function draw() {
    const origin = machine.getBoundingClientRect();
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      const left = rect.left - origin.left;
      const top = rect.top - origin.top;
      return {
        left, top, right: left + rect.width, bottom: top + rect.height,
        x: left + rect.width / 2, y: top + rect.height / 2
      };
    };

    const line = (id, points) => {
      const path = points.map(([x, y]) => x.toFixed(2) + " " + y.toFixed(2)).join(" L");
      byId(id).setAttribute("d", "M" + path);
    };

    const address = bounds(byId("addressRail"));
    const data = bounds(byId("dataRail"));
    const ram = bounds(byId("ramPanel"));
    const acc = bounds(byId("accBlock"));
    const write = bounds(operation(1)).x;
    const read = bounds(operation(2)).x;
    const input = bounds(operation(18)).x;
    const output = bounds(operation(15)).x;

    line("addressToRam", [[ram.x, address.bottom], [ram.x, ram.top - 1]]);
    line("dataToRam", [[write, data.top], [write, ram.bottom + 1]]);
    line("ramToData", [[read, ram.bottom], [read, data.top - 1]]);
    line("dataToAcc", [[input, data.top], [input, acc.bottom + 1]]);
    line("accToData", [[output, acc.bottom], [output, data.top - 1]]);

    if (machine.dataset.control !== "true") return;
    const ir = bounds(byId("irBlock"));
    const pc = bounds(byId("pcBlock"));
    const mc = bounds(byId("mcBlock"));
    const control = bounds(byId("control"));
    const flag = bounds(byId("zeroFlag"));
    const test = bounds(operation(10));
    const irRail = bounds(operation(4)).x;
    const pcRail = bounds(operation(8)).x;
    const dataLink = control.left - 5;
    const zeroLink = Math.max(test.right + 6, acc.left - 8);

    line("dataToIr", [[dataLink, data.top], [dataLink, ir.y], [ir.left - 1, ir.y]]);
    line("irToAddress", [[irRail, ir.top], [irRail, address.bottom + 1]]);
    line("pcToAddress", [[pcRail, pc.top], [pcRail, address.bottom + 1]]);
    line("irToPc", [[ir.right, ir.y], [pc.left - 1, pc.y]]);
    line("irToMc", [[ir.x, ir.bottom], [ir.x, mc.top - 1]]);
    line("zeroToPc", [[acc.left, flag.y], [zeroLink, flag.y], [zeroLink, test.y], [test.right + 1, test.y]]);
  }

  function laneOffset(lane) {
    const boardRect = board.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(machine).paddingLeft);
    const left = lane.getBoundingClientRect().left - boardRect.left + board.scrollLeft - inset;
    return Math.max(0, Math.min(left, board.scrollWidth - board.clientWidth));
  }

  function markSection() {
    if (!board.clientWidth) return;
    let active = sections[0];
    let distance = Infinity;
    for (const section of sections) {
      const current = Math.abs(board.scrollLeft - laneOffset(section.lane));
      if (current < distance) {
        active = section;
        distance = current;
      }
    }
    for (const section of sections) {
      if (section === active) section.button.setAttribute("aria-current", "true");
      else section.button.removeAttribute("aria-current");
    }
  }

  for (const { button, lane } of sections) {
    button.addEventListener("click", () => {
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      board.scrollTo({ left: laneOffset(lane), behavior: reduced ? "instant" : "smooth" });
    });
  }

  let pending = false;
  function layout() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw();
      markSection();
    });
  }

  const observer = new ResizeObserver(layout);
  for (const element of [machine, byId("controlBody"), byId("recordPanel"), byId("accBlock")]) observer.observe(element);
  new MutationObserver(layout).observe(machine, { attributes: true, attributeFilter: ["data-control", "data-mode"] });
  board.addEventListener("scroll", markSection, { passive: true });
  layout();
}
