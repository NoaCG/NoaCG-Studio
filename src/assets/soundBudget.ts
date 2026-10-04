import { MAX_DECODED_AUDIO_BYTES, MAX_DECODED_SOUND_BYTES } from './soundAssets';

/** Count actual decoded copies, including a candidate prepared beside the running output. */
export function createSoundBudget() {
  const allocations = new Map<string,number>();
  return {
    retain(key: string, bytes: number): void {
      if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_DECODED_SOUND_BYTES) throw new Error('Invalid decoded sound size.');
      const total = [...allocations.values()].reduce((a,b)=>a+b,0) - (allocations.get(key) ?? 0) + bytes;
      if (total > MAX_DECODED_AUDIO_BYTES) throw new Error('Prepared sounds exceed 512 MiB. Reduce the sounds in this production.');
      allocations.set(key,bytes);
    },
    release(key: string): void { allocations.delete(key); },
  };
}
