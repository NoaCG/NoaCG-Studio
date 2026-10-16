// Opening a URL in the person's default browser, the one way every command does it.
//
// On Windows this goes through the shell's own URL handler (`rundll32 url.dll,FileProtocolHandler`)
// and never `cmd /c start`. cmd parses its command line, and `&` is its command separator, so every
// `&` in a URL ended the command there: `noacg login` opened `/app?agent=<state>` without its port
// and challenge, the page said the request was not valid, cmd failed on the rest and the CLI said it
// could not open a browser (0.12.0 and earlier). rundll32 takes everything after the function name
// as one string, so the URL arrives whole. The arguments go verbatim, so Node adds no quotes that
// the handler would read as part of the URL. (Node ignores the option on other platforms.)

import { execFile, spawn } from 'node:child_process';

const OPTIONS = { windowsHide: true, windowsVerbatimArguments: true };

/** The program, arguments and options that open `url` in the default browser on `platform`. */
export function openUrlCommand(url: string, platform: NodeJS.Platform = process.platform): { file: string; args: string[]; options: typeof OPTIONS } {
  if (platform === 'win32') return { file: 'rundll32', args: ['url.dll,FileProtocolHandler', url], options: OPTIONS };
  return { file: platform === 'darwin' ? 'open' : 'xdg-open', args: [url], options: OPTIONS };
}

type Run = (file: string, args: string[], options: typeof OPTIONS, done: (error: Error | null) => void) => unknown;

/**
 * Open `url` and resolve whether the opener reported success. That is as honest as the platform
 * lets it be: `open` and `xdg-open` fail when nothing can take the URL, while rundll32 only fails
 * when it cannot start, so on Windows `true` means the shell was handed the whole URL. Callers
 * print the URL either way.
 */
export function openUrl(url: string, platform: NodeJS.Platform = process.platform, run: Run = execFile): Promise<boolean> {
  return new Promise((resolve) => {
    const { file, args, options } = openUrlCommand(url, platform);
    try {
      run(file, args, options, (error) => resolve(!error));
    } catch {
      resolve(false);
    }
  });
}

/** Open `url` without waiting on it, for a long-running command. Detached, so stopping that
 *  command never takes a browser it started down with it. A missing opener (no xdg-open on a bare
 *  Linux box) arrives as an 'error' event, which unheard would stop the process. */
export function launchUrl(url: string): void {
  const { file, args, options } = openUrlCommand(url);
  try {
    const child = spawn(file, args, { ...options, detached: true, stdio: 'ignore' });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // The caller printed the URL; that is the fallback.
  }
}
