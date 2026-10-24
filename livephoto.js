// Live Photo helpers: Apple MakerNote EXIF writer + tiny zip writer. Works in browser & Node.
(function (g) {
  const enc = (s) => new TextEncoder().encode(s);
  function u16(a, o, v) { a[o] = v >> 8; a[o + 1] = v & 255; }
  function u32(a, o, v) { a[o] = v >>> 24; a[o + 1] = (v >>> 16) & 255; a[o + 2] = (v >>> 8) & 255; a[o + 3] = v & 255; }
  function entry(a, o, tag, type, count, val) { u16(a, o, tag); u16(a, o + 2, type); u32(a, o + 4, count); u32(a, o + 8, val); }

  // Build Apple MakerNote ("Apple iOS") with tag 0x11 ContentIdentifier, as used by iPhone / makelive.
  function makerNote(uuid) {
    const s = enc(uuid + "\0");
    const mn = new Uint8Array(32 + s.length);
    mn.set(enc("Apple iOS\0"), 0); u16(mn, 10, 1); mn.set(enc("MM"), 12);
    u16(mn, 14, 1); entry(mn, 16, 0x0011, 2, s.length, 32); u32(mn, 28, 0);
    mn.set(s, 32);
    return mn;
  }
  function exifSegment(uuid) {
    const mn = makerNote(uuid), make = enc("Apple\0");
    const t = new Uint8Array(62 + mn.length);
    t.set(enc("MM"), 0); u16(t, 2, 42); u32(t, 4, 8);
    u16(t, 8, 2); entry(t, 10, 0x010f, 2, make.length, 38); entry(t, 22, 0x8769, 4, 1, 44); u32(t, 34, 0);
    t.set(make, 38);
    u16(t, 44, 1); entry(t, 46, 0x927c, 7, mn.length, 62); u32(t, 58, 0);
    t.set(mn, 62);
    const seg = new Uint8Array(4 + 6 + t.length);
    seg[0] = 0xff; seg[1] = 0xe1; u16(seg, 2, 2 + 6 + t.length);
    seg.set(enc("Exif\0\0"), 4); seg.set(t, 10);
    return seg;
  }
  // Insert EXIF right after SOI, dropping any existing APP0/APP1.
  function addContentIdToJpeg(jpeg, uuid) {
    jpeg = new Uint8Array(jpeg);
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Not a JPEG");
    let p = 2;
    while (jpeg[p] === 0xff && (jpeg[p + 1] === 0xe0 || jpeg[p + 1] === 0xe1)) p += 2 + ((jpeg[p + 2] << 8) | jpeg[p + 3]);
    const seg = exifSegment(uuid), out = new Uint8Array(2 + seg.length + jpeg.length - p);
    out.set([0xff, 0xd8]); out.set(seg, 2); out.set(jpeg.subarray(p), 2 + seg.length);
    return out;
  }
  // Minimal store-only zip.
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (d) => { let c = ~0; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
  function zip(files) {
    const parts = [], cd = []; let off = 0;
    const le = (n, b) => { const a = new Uint8Array(b); for (let i = 0; i < b; i++) a[i] = (n >>> (8 * i)) & 255; return a; };
    for (const f of files) {
      const name = enc(f.name), crc = crc32(f.data), sz = f.data.length;
      const common = [le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(sz, 4), le(sz, 4), le(name.length, 2), le(0, 2)];
      const lh = [le(0x04034b50, 4), ...common, name];
      cd.push([le(0x02014b50, 4), le(20, 2), ...common, le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4), name]);
      for (const x of lh) { parts.push(x); off += x.length; }
      parts.push(f.data); off += sz;
    }
    let cdSize = 0; for (const c of cd) for (const x of c) { parts.push(x); cdSize += x.length; }
    parts.push(le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cdSize, 4), le(off, 4), le(0, 2));
    const total = parts.reduce((s, x) => s + x.length, 0), out = new Uint8Array(total); let o = 0;
    for (const x of parts) { out.set(x, o); o += x.length; }
    return out;
  }
  // ffmpeg args for the paired MOV.
  function movArgs(input, start, dur, uuid, out) {
    return ["-ss", String(start), "-i", input, "-t", String(dur), "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
      "-vf", "scale='if(gt(iw,ih),min(1440,iw),-2)':'if(gt(iw,ih),-2,min(1440,ih))',fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-tag:v", "avc1",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2",
      "-movflags", "use_metadata_tags", "-metadata", "com.apple.quicktime.content.identifier=" + uuid,
      "-f", "mov", out];
  }
  const api = { addContentIdToJpeg, zip, movArgs };
  if (typeof module !== "undefined") module.exports = api; else g.LivePhoto = api;
})(this);
