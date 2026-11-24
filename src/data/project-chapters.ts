import type { ProjectKey } from "./projects";

export const projectChapters = {
  "impedance": [
    {
      "id": "overview",
      "title": "Overview"
    },
    {
      "id": "system-overview",
      "title": "System Overview"
    },
    {
      "id": "pcb-design",
      "title": "PCB Design"
    },
    {
      "id": "sensor-integration",
      "title": "Sensor Integration"
    },
    {
      "id": "firmware",
      "title": "Firmware"
    },
    {
      "id": "control-algorithm",
      "title": "Control Algorithm"
    },
    {
      "id": "results",
      "title": "Results"
    }
  ],
  "drive-by-wire": [
    { id: "link-failure-test", title: "Bench fault tests" },
    { id: "redundant-can", title: "Three controllers, two buses" },
    { id: "consensus-and-timing", title: "Consensus and clock synchronization" },
    { id: "controller-pcb", title: "Four-layer controller PCB" }
  ],
  "vehicle": [
    {
      "id": "overview",
      "title": "Overview"
    },
    {
      "id": "firmware",
      "title": "Kernel and drivers"
    },
    {
      "id": "results",
      "title": "Scheduling on the bench"
    },
    {
      "id": "pcb-design",
      "title": "Test platform"
    },
    {
      "id": "motor-control",
      "title": "Motor-control workload"
    }
  ],
  "robot": [
    {
      "id": "overview",
      "title": "Overview"
    },
    {
      "id": "system-overview",
      "title": "System Overview"
    },
    {
      "id": "power-systems",
      "title": "Power Systems"
    },
    {
      "id": "firmware",
      "title": "Firmware"
    },
    {
      "id": "results",
      "title": "Results"
    }
  ],
  "companion": [
    {
      "id": "overview",
      "title": "Overview"
    },
    {
      "id": "system-overview",
      "title": "System Overview"
    },
    {
      "id": "mechanical-design",
      "title": "Mechanical Design"
    },
    {
      "id": "firmware",
      "title": "Firmware"
    },
    {
      "id": "results",
      "title": "Results"
    }
  ],
  "keychain": [
    {
      "id": "overview",
      "title": "Overview"
    },
    {
      "id": "circuit-design",
      "title": "Circuit Design"
    },
    {
      "id": "power-budget",
      "title": "Power Budget"
    },
    {
      "id": "pcb-art",
      "title": "PCB Art"
    },
    {
      "id": "fabrication",
      "title": "Fabrication"
    },
    {
      "id": "results",
      "title": "Results"
    }
  ]
} satisfies Record<ProjectKey, readonly { id: string; title: string }[]>;
