import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
const xml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const label = 'tech.chaal.bot-league';
const logDir = join(root, 'data/league');
await mkdir(logDir, { recursive: true });
const args = [
	process.execPath,
	`--env-file-if-exists=${join(root, '.env')}`,
	join(root, 'scripts/league/scheduled.mjs')
];
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>300</integer>
<key>ProcessType</key><string>Background</string>
<key>LowPriorityIO</key><true/>
<key>Nice</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(join(logDir, 'schedule.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(logDir, 'schedule-error.log'))}</string>
</dict></plist>`;
if (!process.argv.includes('--install')) {
	console.log(plist);
	process.exit(0);
}
if (process.platform !== 'darwin') throw new Error('This installer is for macOS launchd.');
const agentDir = join(homedir(), 'Library/LaunchAgents');
await mkdir(agentDir, { recursive: true });
const file = join(agentDir, `${label}.plist`);
await writeFile(file, plist, { mode: 0o600 });
try {
	execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
} catch {
	/* First installation. */
}
execFileSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, file], { stdio: 'inherit' });
console.log(
	`Installed ${label}. Checks every five minutes; runs once after 07:00 America/New_York, including DST. Machine must be awake and online.`
);
