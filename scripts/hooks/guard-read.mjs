// PreToolUse guard for the Read and Grep tools: a session never reads a .env file's values into its
// transcript (#1281). The shell side of the same rule is in guard-command.mjs; both decide in
// env-secrets.mjs, which also says what is left alone (the committed .env files, a Grep that only
// lists files).

import { readHookInput, deny } from './lib.mjs';
import { envSecretsRefusal, readsEnvSecrets } from './env-secrets.mjs';

const input = await readHookInput();
const why = readsEnvSecrets(input?.tool_name, input?.tool_input);
if (why) deny(envSecretsRefusal(why));
process.exit(0);
