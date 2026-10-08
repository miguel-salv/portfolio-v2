export const evolution = {
  repository: "https://github.com/miguel-salv/portfolio-v2",
  capturedAt: "2026-10-07",
  viewport: { width: 1440, height: 1000 },
  stages: [
    {
      id: "first-version",
      shortTitle: "Early version",
      title: "Getting the work online.",
      date: "2026-07-03",
      dateLabel: "July 3, 2026",
      commit: "08ae9b9a6d71a2f51344795848ec1dc62aca50f2",
      image: "early",
      alt: "An early portfolio homepage: a cream background, a compact serif introduction with blue emphasis, project and resume links, and a balanced portrait.",
      caption: "An early version, after the initial layout and mobile refinements.",
      paragraphs: [
        "This version brought my projects, experience, and resume into one place. A portrait and a warm, simple layout made it a personal introduction; the hardware lived in the project pages."
      ]
    },
    {
      id: "live-demos",
      shortTitle: "Live demos",
      title: "Letting visitors try it.",
      date: "2026-07-08",
      dateLabel: "July 8, 2026",
      commit: "76d9ee5885cf07043231547a64624e7356077a69",
      image: "demos",
      alt: "The July portfolio's Kirby LED Keychain project page, showing its circuit explanation and interactive LED chase demo.",
      caption: "The LED keychain project, with its browser demo.",
      paragraphs: [
        "I added browser demos so visitors could try parts of the builds. Here, the LED keychain's 555 timer and CD4017 sequence became something you could watch and control, alongside demos for the matcher, vehicle, and robot."
      ]
    },
    {
      id: "hardware-in-motion",
      shortTitle: "Hardware in motion",
      title: "Bringing the hardware forward.",
      date: "2026-09-10",
      dateLabel: "September 10, 2026",
      commit: "6cceab990dc34cc9b6eb8398e2f350630457db42",
      image: "motion",
      alt: "The September homepage, with an impedance matcher render replacing the portrait in the introduction and a photograph of the actual hardware below.",
      caption: "The matcher moves into the homepage introduction.",
      paragraphs: [
        "A rendered impedance matcher moved into the homepage, replacing the portrait. A scroll-driven project journey gave the matcher, vehicle, and robot more room, while photographs kept the actual builds in view."
      ]
    },
    {
      id: "current-version",
      shortTitle: "Today",
      title: "Making the site respond.",
      date: "2026-10-07",
      dateLabel: "October 7, 2026",
      commit: "3817991d9e48707bf006d7e1f3b88828a473b07e",
      image: "current",
      alt: "The October homepage: Hardware and firmware in large sans-serif type, a detailed impedance matcher render, and a short personal introduction.",
      caption: "The homepage when this story was added, October 7, 2026.",
      paragraphs: [
        "The response bench connects the builds through their inputs and outputs. Visitors can switch between devices, tune the matcher, wake Kirby, and run the LED chase. The site explains the hardware through its behavior as well as its photographs."
      ]
    }
  ]
} as const;

export const snapshotSrc = (image: string, width: 720 | 1440 = 1440) =>
  `/assets/site-evolution/${image}${width === 720 ? "-720" : ""}.webp`;

export const commitUrl = (commit: string) => `${evolution.repository}/commit/${commit}`;
