import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

export interface AudioStemCommandInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

@Injectable()
export class AudioStemCommandRunner {
  run(input: AudioStemCommandInput): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(() => rejectPromise(new Error('Audio stem command timed out')));
      }, input.timeoutMs);
      timeout.unref();
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4_000) stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => finish(() => rejectPromise(error)));
      child.on('close', (exitCode) =>
        finish(() => {
          if (exitCode === 0) resolvePromise();
          else
            rejectPromise(
              new Error(
                `Audio stem command exited with code ${exitCode ?? -1}: ${stderr.trim().slice(0, 2_000)}`,
              ),
            );
        }),
      );
    });
  }
}
