// Read-only, explicitly invoked comparison of the affected original and two working clips.
// No transcoding, upload, Bridge commands or changes to the files.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function packetFacts(packets = []) {
  const timestamp = value => value == null || String(value).trim() === '' ? Number.NaN : Number(value);
  const pts = packets.map(p => timestamp(p.pts_time)).filter(Number.isFinite);
  const dts = packets.map(p => timestamp(p.dts_time)).filter(Number.isFinite);
  const regressions = values => values.slice(1).filter((v, i) => v < values[i]).length;
  return { packets: packets.length, missingPts: packets.length - pts.length, missingDts: packets.length - dts.length, backwardsPts: regressions(pts), backwardsDts: regressions(dts), firstPts: pts[0] ?? null, lastPts: pts.at(-1) ?? null };
}

export function compareClips(paths, probe = (args) => JSON.parse(execFileSync('ffprobe', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true }))) {
  if (paths.length !== 3) throw new Error('Supply exactly three originals: problematic, working one, working two.');
  return paths.map((file, i) => {
    const path = resolve(file);
    const info = probe(['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]);
    const packetsAt = interval => packetFacts(probe(['-v', 'error', '-select_streams', 'v:0', '-read_intervals', interval, '-show_entries', 'packet=pts_time,dts_time,duration_time,flags', '-of', 'json', path]).packets);
    const duration = Number(info.format?.duration);
    return { role: i === 0 ? 'problematic' : `working-${i}`, file: path, format: info.format, streams: info.streams, firstPackets: packetsAt('%+#250'), lastPackets: Number.isFinite(duration) && duration > 0 ? packetsAt(`${Math.max(0, duration - 8)}%+#250`) : null };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const paths = process.argv.slice(2);
    if (paths.length !== 3 || paths.some(p => !statSync(resolve(p)).isFile())) throw new Error('Usage: node scripts/compare-studio-media.mjs <problematic-file> <working-file-1> <working-file-2>. Requires ffprobe.');
    process.stdout.write(JSON.stringify({ sampled: true, note: 'PTS reordering can be normal with B-frames. Compare these samples with CLS and repeated INFO/Bridge readings from the same takes; they do not establish the cause alone.', clips: compareClips(paths) }, null, 2) + '\n');
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
