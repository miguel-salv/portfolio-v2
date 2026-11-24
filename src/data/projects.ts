import driveByWireCover from "../assets/drive-by-wire-cover.jpg";

export interface ProjectMetric {
  text: string;
  count?: boolean;
}

export interface ProjectImage {
  jpg: string;
  webp?: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
}

export interface ProjectMeta {
  id: string;
  route: string;
  title: string;
  mapTitle: string;
  address: string;
  context: string;
  description: string;
  socialDescription: string;
  keywords: string;
  contributionNote?: string;
  hero: {
    eyebrow: string;
    lead: string;
    metrics: readonly ProjectMetric[];
    role: string;
    team: string;
    contribution: string;
    image: ProjectImage;
  };
  card: {
    eyebrow: string;
    summary: string;
    metrics: readonly ProjectMetric[];
  };
  links?: { source?: string; documentation?: string };
}

export const projectList = [
  {
    id: "impedance", route: "/project-impedance.html", title: "Automated Impedance Matcher", mapTitle: "Impedance Matcher", address: "0x1000", context: "CMU Hacker Fab",
    contributionNote: "At CMU Hacker Fab, I developed the control PCB, RF sensing integration, embedded interface, firmware, and matching control.",
    description: "A closed-loop RF matching network with coordinate descent control, stepper-driven capacitors, and a custom PCB, built for the CMU Hacker Fab sputtering chamber.",
    socialDescription: "Closed-loop RF matching network: ~1.2 VSWR at 95W forward power, built for $636.", keywords: "rf vswr matching hacker fab teensy",
    hero: { eyebrow: "Embedded · 4 months · CMU Hacker Fab", lead: "A precision automation tool designed to replace manual tuning in dynamic RF sputtering environments.", metrics: [{ text: "~1.2 VSWR", count: true }, { text: "95W forward power", count: true }, { text: "$636 build", count: true }], role: "RF and embedded systems engineer", team: "CMU Hacker Fab project", contribution: "Control PCB, RF sensing integration, embedded interface, firmware, and matching control", image: { jpg: "/assets/projects/impedance/cover.jpg", webp: "/assets/projects/impedance/cover.webp", alt: "Automated impedance matcher hardware", width: 1520, height: 1140 } },
    card: { eyebrow: "Embedded · 4 months · Hacker Fab", summary: "Closed-loop RF matching network with coordinate descent control, stepper-driven air-variable capacitors, VSWR telemetry, and a custom 2-layer PCB.", metrics: [{ text: "~1.2 VSWR", count: true }, { text: "95 W forward power", count: true }, { text: "$636 build", count: true }] },
    links: { source: "https://github.com/hacker-fab/impedance-matcher", documentation: "https://docs.hackerfab.org/home/fab-toolkit/deposition/diy-rf-sputtering-chamber/add-ons-and-wip/automated-impedance-matching" }
  },
  {
    id: "drive-by-wire", route: "/project-drive-by-wire.html", title: "Fault-Tolerant Drive-by-Wire", mapTitle: "Fault-Tolerant Drive-by-Wire", address: "0x6000", context: "CMU 18-449",
    contributionNote: "I worked on PCB power and ground routing, qualified CAN timestamps for clock synchronization, and fixed Raft log catch-up after follower resets. Our CMU 18-449 team integrated the system and ran the bench tests.",
    description: "A three-controller drive-by-wire testbed with redundant CAN, Raft state replication, clock synchronization, and a four-layer controller PCB design.",
    socialDescription: "Three controllers, two CAN buses, and 15.5 µs maximum lamp skew over ten edges during a two-link failure bench test.",
    keywords: "18449 18-449 18-649 CAN Zephyr STM32 Raspberry Pi Raft redundancy consensus distributed embedded systems vehicle PCB",
    hero: {
      eyebrow: "Distributed Embedded Systems · CMU 18-449",
      lead: "With two CAN links disconnected, our three controllers still agreed on network state. The largest measured timing difference between the front and rear lamps was 15.5 µs over ten rising edges.",
      metrics: [],
      role: "PCB and embedded firmware developer",
      team: "CMU 18-449 team project",
      contribution: "PCB power and ground routing, CAN timestamp qualification, and Raft log recovery",
      image: { jpg: driveByWireCover.src, alt: "CAD render of the four-layer controller PCB and Raspberry Pi mounted on the test vehicle chassis", width: driveByWireCover.width, height: driveByWireCover.height, caption: "CAD render of the controller board on the test vehicle chassis." }
    },
    card: {
      eyebrow: "Distributed Embedded Systems · CMU 18-449",
      summary: "Three controllers use redundant CAN to keep sharing state and stay in sync when links fail.",
      metrics: [{ text: "15.5 µs maximum lamp skew over ten measured edges" }]
    }
  },
  {
    id: "robot", route: "/project-robot.html", title: "Trash Collection Robot", mapTitle: "Trash Collection Robot", address: "0x3000", context: "CMU Build18",
    contributionNote: "On the CMU Build18 team, I led electronics and power systems, covering power delivery, motor-drive hardware, the UART protocol, and hardware-firmware integration.",
    description: "An autonomous bottle-collection robot built for CMU's Build18 competition, combining Raspberry Pi vision, Arduino motor control, a UART command protocol, and a custom 9V quad H-bridge power system.", socialDescription: "Autonomous trash-collection robot with Raspberry Pi vision, Arduino control, and custom power delivery.", keywords: "cv vision arduino raspberry pi",
    hero: { eyebrow: "Electrical · 2 months · CMU Build18", lead: "A robot designed to identify and collect trash autonomously, with a focus on water-bottle retrieval.", metrics: [{ text: "Raspberry Pi CV" }, { text: "Arduino control" }, { text: "9V quad H-bridge" }], role: "Electronics and power systems lead", team: "CMU Build18 competition team", contribution: "Power delivery, motor-drive hardware, UART protocol, and hardware-firmware integration", image: { jpg: "/assets/projects/robot/cover.jpg", webp: "/assets/projects/robot/cover.webp", alt: "Trash collection robot chassis with robotic arm and electronics", width: 1820, height: 1112 } },
    card: { eyebrow: "Electrical · 2 months · Build18", summary: "Autonomous bottle-collection robot with Raspberry Pi vision, Arduino motor control, UART command protocol, custom power delivery, and arm actuation.", metrics: [{ text: "Raspberry Pi CV" }, { text: "Arduino control" }, { text: "9V quad H-bridge" }] }
  },
  {
    id: "vehicle", route: "/project-vehicle.html", title: "Bare-Metal RTOS on STM32", mapTitle: "Bare-Metal RTOS on STM32", address: "0x2000", context: "CMU Embedded Systems",
    contributionNote: "For this CMU embedded systems course project, I developed the RTOS kernel, boot code, device drivers, carrier PCB, PID control, and system integration.",
    description: "A bare-metal STM32 operating system with a preemptive rate-monotonic scheduler, ARMv7-M context switching, and register-level drivers.",
    socialDescription: "A custom STM32 RTOS with preemptive scheduling, ARMv7-M context switching, and an interactive scheduler demo.",
    keywords: "rtos stm32 scheduler pid real-time embedded vehicle arm cortex-m4",
    hero: { eyebrow: "Embedded · 4 months · CMU", lead: "I built a preemptive real-time operating system from the reset vector up, then used a small vehicle to exercise the scheduler and drivers.", metrics: [{ text: "STM32 Cortex-M4" }, { text: "Rate-monotonic scheduling" }], role: "Embedded systems engineer", team: "CMU embedded systems course project", contribution: "RTOS kernel, boot code, device drivers, carrier PCB, PID control, and system integration", image: { jpg: "/assets/projects/vehicle/cover.jpg", alt: "Assembled embedded vehicle with STM32 carrier PCB and motor system", width: 1600, height: 1112 } },
    card: { eyebrow: "Embedded · 4 months · CMU", summary: "A custom kernel, preemptive scheduler, and register-level drivers for an STM32 Cortex-M4.", metrics: [{ text: "STM32 Cortex-M4" }, { text: "Rate-monotonic scheduling" }] }
  },
  {
    id: "companion", route: "/project-companion.html", title: "Kirby Companion", mapTitle: "Kirby Companion", address: "0x4000", context: "Personal Project",
    description: "An ESP32-S3 smart display in a custom 3D-printed Kirby enclosure, with a touch UI, weather, alarms, minigames, Wi-Fi, and I2S audio.", socialDescription: "ESP32-S3 smart display with touch UI, I2S audio, and a custom 3D-printed enclosure, built in two weeks.", keywords: "esp32 display touch smart",
    hero: { eyebrow: "Product · 2 weeks · Personal", lead: "A custom interactive Kirby desktop companion built as a standalone smart display.", metrics: [], role: "Product designer and embedded developer", team: "Independent build", contribution: "Enclosure CAD, electronics integration, touch UI, firmware, networking, and audio", image: { jpg: "/assets/projects/companion/cover.jpg", alt: "Kirby Companion embedded device", width: 1600, height: 1075 } },
    card: { eyebrow: "Product · 2 weeks · Personal", summary: "ESP32-S3 smart display in a custom 3D-printed Kirby enclosure, built as a standalone desktop companion with touch UI, weather, alarms, timers, minigame screens, Wi-Fi, and I2S audio.", metrics: [{ text: "2-inch touch display" }, { text: "MAX98357 audio" }, { text: "3D-printed shell" }] }
  },
  {
    id: "keychain", route: "/project-keychain.html", title: "Kirby LED Keychain", mapTitle: "Kirby LED Keychain", address: "0x5000", context: "Personal Project",
    description: "A battery-powered LED chaser keychain on a custom Kirby-shaped PCB with exposed HASL art, 555 timer sequencing, and automatic shutoff. No microcontroller required.", socialDescription: "LED chaser with analog timing and discrete logic on a Kirby-shaped PCB, with custom HASL art and coin-cell auto-shutoff.", keywords: "555 pcb analog discrete logic led chaser",
    hero: { eyebrow: "Discrete logic · 3 weeks · Personal", lead: "An LED chaser on a custom Kirby-shaped PCB, using analog timing and discrete logic. No microcontroller, just a 555 timer and decade counters.", metrics: [{ text: "No microcontroller" }, { text: "Auto-shutoff" }, { text: "Custom PCB art" }], role: "Circuit and PCB designer", team: "Independent build", contribution: "Analog timing, discrete sequencing, auto-shutoff circuit, schematic, PCB layout, artwork, and fabrication", image: { jpg: "/assets/projects/keychain/cover.jpg", webp: "/assets/projects/keychain/cover.webp", alt: "Kirby-shaped LED keychain PCB", width: 1254, height: 1254 } },
    card: { eyebrow: "Discrete logic · 3 weeks · Personal", summary: "LED chaser on a custom Kirby-shaped PCB with analog 555 timer clocking, decade-counter logic, exposed HASL art, and coin-cell auto-shutoff.", metrics: [{ text: "No microcontroller" }, { text: "Auto-shutoff" }, { text: "Custom PCB art" }] }
  }
] as const satisfies readonly ProjectMeta[];

export type ProjectKey = (typeof projectList)[number]["id"];

export const projects = Object.fromEntries(
  projectList.map((project) => [project.id, project])
) as unknown as Record<ProjectKey, ProjectMeta>;

export function nextProject(project: ProjectMeta) {
  const index = projectList.findIndex((entry) => entry.id === project.id);
  return projectList[(index + 1) % projectList.length];
}
