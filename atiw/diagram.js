// SPDX-License-Identifier: AGPL-3.0-or-later

export function wireDiagram() {
  const byId = (id) => document.getElementById(id);
  const machine = byId("machine");
  const wiring = byId("wiring");
  const compact = matchMedia("(max-width: 1010px), (max-height: 608px)");
  const tabs = [...document.querySelectorAll(".board-nav [data-pane]")];
  const names = tabs.map((tab) => tab.dataset.pane);
  const paths = new Map([...wiring.querySelectorAll(".wire")].map((path) => [path.id, path]));

  function showPane(name) {
    if (!names.includes(name)) return;
    machine.dataset.pane = name;
    for (const tab of tabs) {
      const selected = tab.dataset.pane === name;
      tab.setAttribute("aria-selected", selected);
      tab.tabIndex = selected ? 0 : -1;
      const pane = byId(tab.dataset.pane);
      pane.setAttribute("role", compact.matches ? "tabpanel" : "region");
      pane.setAttribute("aria-labelledby", compact.matches ? tab.id : tab.dataset.pane + "Heading");
    }
    schedule();
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => showPane(tab.dataset.pane));
    tab.addEventListener("keydown", (event) => {
      const target = {
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1
      }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      showPane(names[target]);
      tabs[target].focus();
    });
  }

  compact.addEventListener("change", () => showPane(machine.dataset.pane));

  function draw() {
    const origin = machine.getBoundingClientRect();
    if (!origin.width || !origin.height) return;
    wiring.setAttribute("viewBox", "0 0 " + origin.width + " " + origin.height);

    const route = new Map();
    const box = (element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      if (!width || !height) return null;
      const x = left - origin.left;
      const y = top - origin.top;
      return { left: x, top: y, right: x + width, bottom: y + height, width, centerY: y + height / 2 };
    };
    const at = (rect, fraction) => rect.left + rect.width * fraction;
    const add = (id, points) => route.set(id, points);

    const address = box(byId("addressRail"));
    const data = box(byId("dataRail"));
    const ram = box(byId("ramPanel"));
    const ir = box(byId("irBlock"));
    const pc = box(byId("pcBlock"));
    const mc = box(byId("mcBlock"));
    const acc = box(byId("accBlock"));
    const zero = box(byId("zeroFlag"));

    if (ram) {
      const addressPort = at(ram, 0.5);
      const write = at(ram, 0.25);
      const read = at(ram, 0.75);
      add("addressToRam", [[addressPort, address.bottom], [addressPort, ram.top - 1]]);
      add("dataToRam", [[write, data.top], [write, ram.bottom + 1]]);
      add("ramToData", [[read, ram.bottom], [read, data.top - 1]]);
    }

    if (ir && pc && mc) {
      const dataLink = box(byId("control")).left + 2;
      const irPort = at(ir, 0.5);
      const pcPort = at(pc, 0.5);
      add("dataToIr", [[dataLink, data.top], [dataLink, ir.centerY], [ir.left - 1, ir.centerY]]);
      add("irToAddress", [[irPort, ir.top], [irPort, address.bottom + 1]]);
      add("pcToAddress", [[pcPort, pc.top], [pcPort, address.bottom + 1]]);
      add("irToPc", [[ir.right, ir.centerY], [pc.left - 1, pc.centerY]]);

      if (mc.left > pc.right) {
        const outlet = ir.right - 11;
        const turn = ir.bottom + 3;
        const gutter = mc.left - 11;
        add("irToMc", [[outlet, ir.bottom], [outlet, turn], [gutter, turn], [gutter, mc.centerY], [mc.left - 1, mc.centerY]]);
      } else if (machine.dataset.manual === "true") {
        const outlet = ir.right - 9;
        const turn = ir.bottom + 3;
        const gutter = at(mc, 0.5);
        add("irToMc", [[outlet, ir.bottom], [outlet, turn], [gutter, turn], [gutter, mc.top - 1]]);
      } else {
        add("irToMc", [[irPort, ir.bottom], [irPort, mc.top - 1]]);
      }
    }

    if (acc) {
      const input = at(acc, 0.25);
      const output = at(acc, 0.75);
      add("dataToAcc", [[input, data.top], [input, acc.bottom + 1]]);
      add("accToData", [[output, acc.bottom], [output, data.top - 1]]);
    }
    if (pc && zero) {
      const gutter = pc.right + 12;
      add("zeroToPc", [[zero.left - 1, zero.centerY], [gutter, zero.centerY], [gutter, pc.centerY], [pc.right + 1, pc.centerY]]);
    }

    for (const [id, path] of paths) {
      const points = route.get(id);
      if (!points) path.removeAttribute("d");
      else path.setAttribute("d", points.map(([x, y], index) => (index ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2)).join(" "));
    }
  }

  let frame;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      draw();
    });
  }

  const resize = new ResizeObserver(schedule);
  for (const id of ["machine", "addressRail", "dataRail", "ramPanel", "irBlock", "pcBlock", "mcBlock", "accBlock", "zeroFlag"]) {
    resize.observe(byId(id));
  }
  new MutationObserver(schedule).observe(machine, {
    attributes: true, attributeFilter: ["data-pane", "data-control", "data-manual", "data-mode"]
  });
  showPane("memory");
  return showPane;
}
