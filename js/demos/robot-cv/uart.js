// Illustrative Pi -> Arduino command protocol for the robot demo.
// Invented but plausible framing (start byte + command + argument + XOR checksum),
// not the exact bytes from the physical build.

const START_BYTE = 0xaa;

export const CMD = {
  STOP: 0x00,
  BRG: 0x01,
  FWD: 0x02,
  ARM: 0x03,
};

function toHex(n) {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

function checksum(bytes) {
  return bytes.reduce((acc, b) => acc ^ b, 0);
}

function describe(cmd, arg) {
  switch (cmd) {
    case CMD.BRG: {
      // Arg is a signed bearing offset (int8)
      const offset = arg > 127 ? arg - 256 : arg;
      return `BRG ${offset >= 0 ? "+" : ""}${offset}\u00b0`;
    }
    case CMD.FWD:
      return `FWD ${arg}in`;
    case CMD.ARM:
      return arg === 0 ? "ARM OPEN" : "ARM CLOSE";
    case CMD.STOP:
    default:
      return "STOP";
  }
}

export function createUartLog(maxEntries = 7) {
  const entries = [];
  let seq = 0;

  return {
    send(cmd, rawArg = 0) {
      const argByte = rawArg & 0xff;
      const bytes = [START_BYTE, cmd, argByte];
      const chk = checksum(bytes);
      const hex = [...bytes, chk].map(toHex).join(" ");
      seq += 1;
      entries.push({ id: seq, hex, label: describe(cmd, rawArg) });
      if (entries.length > maxEntries) entries.shift();
      return { bytes: [...bytes, chk] };
    },
    getEntries() {
      return entries;
    },
  };
}
