const $ = (id) => document.getElementById(id);
const vid = $("vid"), start = $("start"), len = $("len"), key = $("key");
let file, ff, urls = [];
const st = (t) => ($("status").textContent = t);
$("file").onchange = (e) => {
  file = e.target.files[0]; if (!file) return;
  vid.src = URL.createObjectURL(file); $("editor").classList.remove("hidden"); $("result").classList.add("hidden");
};
vid.onloadedmetadata = () => {
  const d = vid.duration; start.max = Math.max(0, d - 0.5); len.max = Math.min(3, d).toFixed(1); len.value = len.max; start.value = 0; sync(); key.value = len.value / 2; sync(true);
};
function sync(seekKey) {
  const d = vid.duration || 0, s = +start.value, l = Math.min(+len.value, d - s);
  key.min = s; key.max = s + l; if (+key.value < s || +key.value > s + l) key.value = s + l / 2;
  $("sv").textContent = s.toFixed(1) + "s"; $("lv").textContent = l.toFixed(1) + "s"; $("kv").textContent = (+key.value - s).toFixed(1) + "s in";
  if (seekKey) vid.currentTime = +key.value;
}
start.oninput = () => sync(true); len.oninput = () => sync(true); key.oninput = () => sync(true);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c == "x" ? r : (r & 3) | 8).toString(16); })).toUpperCase();
function grabStill(t) {
  return new Promise((res) => {
    vid.onseeked = () => { vid.onseeked = null; const c = document.createElement("canvas"); c.width = vid.videoWidth; c.height = vid.videoHeight;
      const m = 1440 / Math.max(c.width, c.height); if (m < 1) { c.width = Math.round(c.width * m); c.height = Math.round(c.height * m); }
      c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height); c.toBlob((b) => b.arrayBuffer().then(res), "image/jpeg", 0.92); };
    vid.currentTime = t;
  });
}
$("go").onclick = async () => {
  const btn = $("go"); btn.disabled = true; vid.pause();
  try {
    const id = uuid(), s = +start.value, l = Math.min(+len.value, vid.duration - s), name = "IMG_" + id.slice(0, 4);
    st("Grabbing still photo…"); const jpg = LivePhoto.addContentIdToJpeg(await grabStill(+key.value), id);
    if (!ff) {
      st("Loading converter (first time only, ~30 MB)…");
      ff = new FFmpegWASM.FFmpeg(); const base = new URL("vendor/ff/", location.href).href;
      ff.on("progress", ({ progress }) => { $("prog").value = Math.min(1, Math.max(0, progress)); });
      await ff.load({ coreURL: base + "ffmpeg-core.js", wasmURL: base + "ffmpeg-core.wasm" });
    }
    st("Converting video… (this can take a minute)"); $("prog").classList.remove("hidden"); $("prog").value = 0;
    const ext = (file.name.match(/\.\w+$/) || [".mp4"])[0];
    await ff.writeFile("in" + ext, new Uint8Array(await file.arrayBuffer()));
    const code = await ff.exec(LivePhoto.movArgs("in" + ext, s.toFixed(3), l.toFixed(3), id, "out.mov"));
    if (code !== 0) throw new Error("ffmpeg failed (" + code + ")");
    const mov = await ff.readFile("out.mov"); ff.deleteFile("in" + ext); ff.deleteFile("out.mov");
    urls.forEach(URL.revokeObjectURL); urls = [];
    const link = (el, data, type, fn) => { const u = URL.createObjectURL(new Blob([data], { type })); urls.push(u); el.href = u; el.download = fn; return u; };
    $("still").src = link($("djpg"), jpg, "image/jpeg", name + ".JPG");
    link($("dmov"), mov, "video/quicktime", name + ".MOV");
    link($("dzip"), LivePhoto.zip([{ name: name + ".JPG", data: jpg }, { name: name + ".MOV", data: mov }]), "application/zip", name + "_LivePhoto.zip");
    $("result").classList.remove("hidden"); st("Done! Content ID " + id); $("result").scrollIntoView({ behavior: "smooth" });
  } catch (e) { console.error(e); st("Something went wrong: " + e.message); }
  $("prog").classList.add("hidden"); btn.disabled = false;
};
