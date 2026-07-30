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
  hero: {
    eyebrow: string;
    lead: string;
    metrics: ProjectMetric[];
    role: string;
    team: string;
    contribution: string;
    image: ProjectImage;
  };
  card: {
    eyebrow: string;
    summary: string;
    metrics: ProjectMetric[];
  };
  links?: { source?: string; documentation?: string };
}

export const projectList: ProjectMeta[] = [
  {
    id: "impedance", route: "/project-impedance.html", title: "Automated Impedance Matcher", mapTitle: "Impedance Matcher", address: "0x1000", context: "CMU Hacker Fab",
    description: "A closed-loop RF matching network with coordinate descent control, stepper-driven capacitors, and a custom PCB, built for the CMU Hacker Fab sputtering chamber.",
    socialDescription: "Closed-loop RF matching network: ~1.2 VSWR at 95W forward power, built for $636.", keywords: "rf vswr matching hacker fab teensy",
    hero: { eyebrow: "Embedded · 4 months · CMU Hacker Fab", lead: "A precision automation tool designed to replace manual tuning in dynamic RF sputtering environments.", metrics: [{ text: "~1.2 VSWR", count: true }, { text: "95W forward power", count: true }, { text: "$636 build", count: true }], role: "RF and embedded systems engineer", team: "CMU Hacker Fab project", contribution: "Control PCB, RF sensing integration, embedded interface, firmware, and matching control", image: { jpg: "/assets/projects/impedance/cover.jpg", webp: "/assets/projects/impedance/cover.webp", alt: "Automated impedance matcher hardware", width: 1520, height: 1140 } },
    card: { eyebrow: "Embedded · 4 months · Hacker Fab", summary: "Closed-loop RF matching network with coordinate descent control, stepper-driven air-variable capacitors, VSWR telemetry, and a custom 2-layer PCB.", metrics: [{ text: "~1.2 VSWR", count: true }, { text: "95 W forward power", count: true }, { text: "$636 build", count: true }] },
    links: { source: "https://github.com/hacker-fab/impedance-matcher", documentation: "https://docs.hackerfab.org/home/fab-toolkit/deposition/diy-rf-sputtering-chamber/add-ons-and-wip/automated-impedance-matching" }
  },
  {
    id: "vehicle", route: "/project-vehicle.html", title: "Real-Time Embedded Vehicle", mapTitle: "Real-Time Embedded Vehicle", address: "0x2000", context: "CMU Embedded Systems",
    description: "An embedded vehicle built from bare metal: custom RTOS with preemptive scheduling, ARMv7-M boot code, PID speed control, and a custom STM32 carrier PCB.",
    socialDescription: "STM32 vehicle stack with a custom RTOS, rate-monotonic scheduling, and under 10% average speed error.", keywords: "rtos stm32 scheduler pid",
    hero: { eyebrow: "Embedded · 4 months · CMU", lead: "An embedded car powered by a custom-built real-time operating system.", metrics: [{ text: "STM32 Cortex-M4" }, { text: "RMS scheduler" }, { text: "<10% average speed error", count: true }], role: "Embedded systems engineer", team: "CMU embedded systems course project", contribution: "RTOS kernel, boot code, device drivers, carrier PCB, PID control, and system integration", image: { jpg: "/assets/projects/vehicle/cover.jpg", alt: "Assembled embedded vehicle with STM32 carrier PCB and motor system", width: 1600, height: 1112 } },
    card: { eyebrow: "Embedded · 4 months · CMU", summary: "STM32 vehicle stack with a custom RTOS, ARMv7-M boot code, preemptive scheduling, PID speed control, UART telemetry, and LCD state updates.", metrics: [{ text: "STM32 Cortex-M4" }, { text: "RMS scheduler" }, { text: "<10% average speed error", count: true }] }
  },
  {
    id: "robot", route: "/project-robot.html", title: "Trash Collection Robot", mapTitle: "Trash Collection Robot", address: "0x3000", context: "CMU Build18",
    description: "An autonomous bottle-collection robot built for CMU's Build18 competition, combining Raspberry Pi vision, Arduino motor control, a UART command protocol, and a custom 9V quad H-bridge power system.", socialDescription: "Autonomous trash-collection robot with Raspberry Pi vision, Arduino control, and custom power delivery.", keywords: "cv vision arduino raspberry pi",
    hero: { eyebrow: "Electrical · 2 months · CMU Build18", lead: "A robot designed to identify and collect trash autonomously, with a focus on water-bottle retrieval.", metrics: [{ text: "Raspberry Pi CV" }, { text: "Arduino control" }, { text: "9V quad H-bridge" }], role: "Electronics and power systems lead", team: "CMU Build18 competition team", contribution: "Power delivery, motor-drive hardware, UART protocol, and hardware-firmware integration", image: { jpg: "/assets/projects/robot/cover.jpg", webp: "/assets/projects/robot/cover.webp", alt: "Trash collection robot chassis with robotic arm and electronics", width: 1820, height: 1112 } },
    card: { eyebrow: "Electrical · 2 months · Build18", summary: "Autonomous bottle-collection robot with Raspberry Pi vision, Arduino motor control, UART command protocol, custom power delivery, and arm actuation.", metrics: [{ text: "Raspberry Pi CV" }, { text: "Arduino control" }, { text: "9V quad H-bridge" }] }
  },
  {
    id: "companion", route: "/project-companion.html", title: "Kirby Companion", mapTitle: "Kirby Companion", address: "0x4000", context: "Personal Project",
    description: "An ESP32-S3 smart display in a custom 3D-printed Kirby enclosure, with a touch UI, weather, alarms, minigames, Wi-Fi, and I2S audio.", socialDescription: "ESP32-S3 smart display with touch UI, I2S audio, and a custom 3D-printed enclosure, built in two weeks.", keywords: "esp32 display touch smart",
    hero: { eyebrow: "Product · 2 weeks · Personal", lead: "A custom interactive Kirby desktop companion built as a standalone smart display.", metrics: [], role: "Product designer and embedded developer", team: "Independent build", contribution: "Enclosure CAD, electronics integration, touch UI, firmware, networking, and audio", image: { jpg: "/assets/projects/companion/cover.jpg", alt: "Kirby Companion embedded device", width: 1600, height: 1075 } },
    card: { eyebrow: "Product · 2 weeks · Personal", summary: "ESP32-S3 smart display in a custom Kirby enclosure with touch UI, weather, alarms, timers, minigame screens, Wi-Fi, and I2S audio.", metrics: [{ text: "2-inch touch display" }, { text: "MAX98357 audio" }, { text: "3D-printed shell" }] }
  },
  {
    id: "keychain", route: "/project-keychain.html", title: "Kirby LED Keychain", mapTitle: "Kirby LED Keychain", address: "0x5000", context: "Personal Project",
    description: "A battery-powered LED chaser keychain on a custom Kirby-shaped PCB with exposed HASL art, 555 timer sequencing, and automatic shutoff. No microcontroller required.", socialDescription: "Pure analog LED chaser on a Kirby-shaped PCB with custom HASL art, 555 timer clocking, and coin-cell auto-shutoff.", keywords: "555 pcb analog led chaser",
    hero: { eyebrow: "Analog · 3 weeks · Personal", lead: "A pure analog LED chaser on a custom Kirby-shaped PCB. No microcontroller, just a 555 timer and decade counters.", metrics: [{ text: "No microcontroller" }, { text: "Auto-shutoff" }, { text: "Custom PCB art" }], role: "Circuit and PCB designer", team: "Independent build", contribution: "Analog sequencing, auto-shutoff circuit, schematic, PCB layout, artwork, and fabrication", image: { jpg: "/assets/projects/keychain/cover.jpg", webp: "/assets/projects/keychain/cover.webp", alt: "Kirby-shaped LED keychain PCB", width: 1254, height: 1254 } },
    card: { eyebrow: "Analog · 3 weeks · Personal", summary: "Pure analog LED chaser on a custom Kirby-shaped PCB with 555 timer sequencing, decade counters, exposed HASL art, and coin-cell auto-shutoff.", metrics: [{ text: "No microcontroller" }, { text: "Auto-shutoff" }, { text: "Custom PCB art" }] }
  }
];

export const projects = Object.fromEntries(projectList.map((project) => [project.id, project])) as Record<string, ProjectMeta>;

export function nextProject(project: ProjectMeta) {
  const index = projectList.findIndex((entry) => entry.id === project.id);
  return projectList[(index + 1) % projectList.length];
}
