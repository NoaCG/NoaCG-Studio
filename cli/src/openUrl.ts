// Opening a URL in the person's default browser, the one way every command does it.
//
// On Windows this goes through the shell's own URL handler (`rundll32 url.dll,FileProtocolHandler`)
// and never `cmd /c start`. cmd parses its command line, and `&` is its command separator, so every
// `&` in a URL ended the command there: `noacg login` opened `/app?agent=<state>` without its port
// and challenge, the page said the request was not valid, cmd failed on the rest and the CLI said it
// could not open a browser (0.12.0 and earlier). rundll32 takes everything after the function name
// as one string, so the URL arrives whole. The arguments go verbatim, so Node adds no quotes that
// the handler would read as part of the URL.

import { execFile } from 'node:child_process';

export interface OpenCommand {
  file: string;
  args: string[];
}

/** The program and arguments that open `url` in the default browser on `platform`. */
export function openUrlCommand(url: string, platform: NodeJS.Platform = process.platform): OpenCommand {
  if (platform === 'win32') return { file: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  if (platform === 'darwin') return { file: 'open', args: [url] };
  return { file: 'xdg-open', args: [url] };
}

/** The options the command runs with: hidden, and on Windows verbatim (see above). */
export function openUrlOptions(platform: NodeJS.Platform = process.platform): { windowsHide: boolean; windowsVerbatimArguments: boolean } {
  return { windowsHide: true, windowsVerbatimArguments: platform === 'win32' };
}

type Run = (file: string, args: string[], options: ReturnType<typeof openUrlOptions>, done: (error: Error | null) => void) => unknown;

/**
 * Open `url` and resolve whether the opener reported success. That is as honest as the platform
 * lets it be: `open` and `xdg-open` fail when nothing can take the URL, while rundll32 only fails
 * when it cannot start, so on Windows `true` means the shell was handed the whole URL. Callers
 * print the URL either way.
 */
export function openUrl(url: string, platform: NodeJS.Platform = process.platform, run: Run = execFile): Promise<boolean> {
  return new Promise((resolve) => {
    const { file, args } = openUrlCommand(url, platform);
    try {
      run(file, args, openUrlOptions(platform), (error) => resolve(!error));
    } catch {
      resolve(false);
    }
  });
}
