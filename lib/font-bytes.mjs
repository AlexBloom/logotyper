// Serve a selected TTC face as a standalone SFNT for browsers that pick face zero.
export function previewBytes(bytes, postscript) {
  if (bytes.toString("ascii", 0, 4) !== "ttcf") return bytes;
  const count = bytes.readUInt32BE(8);
  for (let face = 0; face < count; face++) {
    const base = bytes.readUInt32BE(12 + face * 4),
      n = bytes.readUInt16BE(base + 4),
      tables = [];
    for (let i = 0; i < n; i++) {
      const at = base + 12 + i * 16;
      tables.push({
        tag: bytes.toString("ascii", at, at + 4),
        sum: bytes.readUInt32BE(at + 4),
        offset: bytes.readUInt32BE(at + 8),
        length: bytes.readUInt32BE(at + 12),
      });
    }
    const name = tables.find((t) => t.tag === "name");
    let matches = false;
    if (name) {
      const total = bytes.readUInt16BE(name.offset + 2),
        strings = name.offset + bytes.readUInt16BE(name.offset + 4);
      for (let i = 0; i < total; i++) {
        const at = name.offset + 6 + i * 12;
        if (bytes.readUInt16BE(at + 6) !== 6) continue;
        const platform = bytes.readUInt16BE(at),
          len = bytes.readUInt16BE(at + 8),
          start = strings + bytes.readUInt16BE(at + 10);
        let label;
        if (platform === 0 || platform === 3) {
          const b = Buffer.from(bytes.subarray(start, start + len));
          label = b.swap16().toString("utf16le");
        } else label = bytes.toString("latin1", start, start + len);
        if (label === postscript) matches = true;
      }
    }
    if (!matches) continue;
    let size = 12 + n * 16;
    const offsets = tables.map((t) => {
      const at = size;
      size += Math.ceil(t.length / 4) * 4;
      return at;
    });
    const out = Buffer.alloc(size);
    bytes.copy(out, 0, base, base + 12);
    tables.forEach((t, i) => {
      const at = 12 + i * 16;
      out.write(t.tag, at, 4, "ascii");
      out.writeUInt32BE(t.sum, at + 4);
      out.writeUInt32BE(offsets[i], at + 8);
      out.writeUInt32BE(t.length, at + 12);
      bytes.copy(out, offsets[i], t.offset, t.offset + t.length);
      if (t.tag === "head") out.writeUInt32BE(0, offsets[i] + 8);
    });
    const head = tables.findIndex((t) => t.tag === "head");
    if (head >= 0) {
      let sum = 0;
      for (let i = 0; i < out.length; i += 4)
        sum = (sum + out.readUInt32BE(i)) >>> 0;
      out.writeUInt32BE((0xb1b0afba - sum) >>> 0, offsets[head] + 8);
    }
    return out;
  }
  throw Error(
    "Selected font collection face could not be prepared for preview.",
  );
}
